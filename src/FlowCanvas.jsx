import { useEffect, useRef, useState } from 'react';
import dagre from 'dagre';
import rough from 'roughjs';

const FlowCanvas = ({ nodes, edges, onExportReady, aiTitle }) => {
  const svgRef = useRef(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 800, height: 600 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = svgRef.current;
    const rc = rough.svg(svg);

    // Clear previous content
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    // Create dagre graph with slightly different spacing to improve branching
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 120 });
    g.setDefaultEdgeLabel(() => ({}));

    // Compute indegree to encourage spacing for merge points
    const indegree = {};
    edges.forEach(e => {
      indegree[e.to] = (indegree[e.to] || 0) + 1;
      if (!(e.from in indegree)) indegree[e.from] = indegree[e.from] || 0;
    });

    // Add nodes to graph
    nodes.forEach(node => {
      const width = node.type === 'decision' ? 150 : 180;
      const height = node.type === 'decision' ? 100 : 60;
      g.setNode(node.id, { label: node.label, width, height, type: node.type });
    });

    // Add edges to graph with minlen bias for merges
    edges.forEach(edge => {
      const targetIndegree = indegree[edge.to] || 0;
      const minlen = targetIndegree > 1 ? 2 : 1;
      g.setEdge(edge.from, edge.to, { label: edge.label, minlen });
    });

    // Calculate layout
    dagre.layout(g);

    // Calculate bounds for viewBox
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    // Draw title area (if provided) reserve space at top
    const TITLE_HEIGHT = aiTitle ? 56 : 0;

    // Draw nodes
    nodes.forEach(node => {
      const n = g.node(node.id);
      const x = n.x - n.width / 2;
      const y = n.y - n.height / 2 + TITLE_HEIGHT;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + n.width);
      maxY = Math.max(maxY, y + n.height);

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

      if (node.type === 'decision') {
        // diamond -> use rotated rect path
        const cx = n.x;
        const cy = n.y + TITLE_HEIGHT;
        const w = n.width;
        const h = n.height;
        const points = [
          [cx, cy - h / 2],
          [cx + w / 2, cy],
          [cx, cy + h / 2],
          [cx - w / 2, cy],
        ].map(p => p.join(',')).join(' ');
        const polygon = rc.polygon(points.split(' ').map(s => s.split(',').map(Number)), {
          fill: 'rgba(173, 216, 230, 0.5)',
          fillStyle: 'solid',
          stroke: '#333',
          strokeWidth: 2,
          roughness: 1.5,
          bowing: 2
        });
        group.appendChild(polygon);
      } else {
        const rect = rc.rectangle(x, y, n.width, n.height, {
          fill: 'rgba(173, 216, 230, 0.5)',
          fillStyle: 'solid',
          stroke: '#333',
          strokeWidth: 2,
          roughness: 1.5,
          bowing: 2
        });
        group.appendChild(rect);
      }

      // Add text
      const text = createWrappedText(n.label, n.x, n.y + TITLE_HEIGHT, n.width - 20);
      group.appendChild(text);

      svg.appendChild(group);
    });

    // Draw edges
    edges.forEach(edge => {
      const e = g.edge(edge.from, edge.to);
      if (!e.points || e.points.length === 0) return;

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

      // Adjust points for title offset
      const points = e.points.map(p => [p.x, p.y + (aiTitle ? 56 : 0)]);
      const line = rc.linearPath(points, {
        stroke: '#666',
        strokeWidth: 2,
        roughness: 1
      });

      group.appendChild(line);

      // Draw arrowhead at end
      const lastPoint = points[points.length - 1];
      const secondLastPoint = points[points.length - 2] || lastPoint;
      const angle = Math.atan2(lastPoint[1] - secondLastPoint[1], lastPoint[0] - secondLastPoint[0]);

      const arrowSize = 10;
      const arrowPoints = [
        [lastPoint[0], lastPoint[1]],
        [lastPoint[0] - arrowSize * Math.cos(angle - Math.PI / 6), lastPoint[1] - arrowSize * Math.sin(angle - Math.PI / 6)],
        [lastPoint[0] - arrowSize * Math.cos(angle + Math.PI / 6), lastPoint[1] - arrowSize * Math.sin(angle + Math.PI / 6)]
      ];

      const arrow = rc.polygon(arrowPoints, {
        fill: '#666',
        fillStyle: 'solid',
        stroke: '#666',
        strokeWidth: 1,
        roughness: 0.5
      });
      group.appendChild(arrow);

      // Add edge label if exists
      if (edge.label) {
        const midIndex = Math.floor(points.length / 2);
        const mx = points[midIndex][0];
        const my = points[midIndex][1] - 10;
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', mx);
        t.setAttribute('y', my);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('font-size', '12');
        t.setAttribute('fill', '#444');
        t.textContent = edge.label;
        group.appendChild(t);
      }

      svg.appendChild(group);

      // Update bounds with edge points
      points.forEach(p => {
        minX = Math.min(minX, p[0]);
        minY = Math.min(minY, p[1]);
        maxX = Math.max(maxX, p[0]);
        maxY = Math.max(maxY, p[1]);
      });
    });

    // If we have a title, draw it at the top center
    if (aiTitle) {
      const titleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const titleBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const titlePadding = 12;
      // Title width based on bounding box width
      const titleWidth = Math.max(200, (maxX - minX));
      const titleX = minX + (maxX - minX) / 2 - titleWidth / 2;
      const titleY = minY - TITLE_HEIGHT + 8;

      titleBg.setAttribute('x', titleX);
      titleBg.setAttribute('y', titleY);
      titleBg.setAttribute('width', titleWidth);
      titleBg.setAttribute('height', TITLE_HEIGHT - 12);
      titleBg.setAttribute('fill', '#fff8d6');
      titleBg.setAttribute('stroke', '#e2c94a');
      titleBg.setAttribute('rx', 8);
      titleBg.setAttribute('ry', 8);
      titleGroup.appendChild(titleBg);

      const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      titleText.setAttribute('x', titleX + titleWidth / 2);
      titleText.setAttribute('y', titleY + (TITLE_HEIGHT - 12) / 2 + 4);
      titleText.setAttribute('text-anchor', 'middle');
      titleText.setAttribute('font-size', '16');
      titleText.setAttribute('fill', '#333');
      titleText.setAttribute('font-family', 'Comic Sans MS, cursive, sans-serif');
      titleText.textContent = aiTitle;
      titleGroup.appendChild(titleText);

      svg.appendChild(titleGroup);

      // Update bounds to include title
      minY = Math.min(minY, titleY);
      minX = Math.min(minX, titleX);
      maxX = Math.max(maxX, titleX + titleWidth);
      maxY = Math.max(maxY, titleY + TITLE_HEIGHT - 12);
    }

    // Add margin
    const MARGIN = 20;
    minX = (minX === Infinity) ? 0 : minX - MARGIN;
    minY = (minY === Infinity) ? 0 : minY - MARGIN;
    maxX = (maxX === -Infinity) ? 800 : maxX + MARGIN;
    maxY = (maxY === -Infinity) ? 600 : maxY + MARGIN;

    const vbWidth = Math.max(100, Math.ceil(maxX - minX));
    const vbHeight = Math.max(100, Math.ceil(maxY - minY));

    svg.setAttribute('viewBox', `${minX} ${minY} ${vbWidth} ${vbHeight}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Callback so caller can export
    if (typeof onExportReady === 'function') {
      onExportReady(svg);
    }
  }, [nodes, edges, onExportReady, aiTitle, svgRef]);

  // basic pan/zoom handlers omitted for brevity - reuse your existing handlers if present
  const handleWheel = (e) => { /* existing behavior */ };
  const handleMouseDown = (e) => { setIsPanning(true); setPanStart({ x: e.clientX, y: e.clientY }); };
  const handleMouseMove = (e) => { if (!isPanning) return; /* existing behavior */ };
  const handleMouseUp = () => { setIsPanning(false); };

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      style={{
        height: '100%',
        cursor: isPanning ? 'grabbing' : 'grab',
        border: '1px solid #ccc',
        backgroundColor: '#fefefe'
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
};

function createWrappedText(text, x, y, maxWidth) {
  const CHAR_WIDTH_ESTIMATE = 8;
  const LINE_HEIGHT = 16;

  const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  textElement.setAttribute('x', x);
  textElement.setAttribute('y', y);
  textElement.setAttribute('text-anchor', 'middle');
  textElement.setAttribute('dominant-baseline', 'middle');
  textElement.setAttribute('font-size', '14');
  textElement.setAttribute('fill', '#333');
  textElement.setAttribute('font-family', 'Comic Sans MS, cursive, sans-serif');

  // Simple word wrapping
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    // Rough estimate based on character width
    if (testLine.length * CHAR_WIDTH_ESTIMATE > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  if (currentLine) {
    lines.push(currentLine);
  }

  // Create tspan for each line
  const startY = y - ((lines.length - 1) * LINE_HEIGHT) / 2;

  lines.forEach((line, i) => {
    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    tspan.setAttribute('x', x);
    tspan.setAttribute('y', startY + i * LINE_HEIGHT);
    tspan.textContent = line;
    textElement.appendChild(tspan);
  });

  return textElement;
}

export default FlowCanvas;
