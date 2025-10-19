import { useEffect, useRef, useState } from 'react';
import dagre from 'dagre';
import rough from 'roughjs';

const FlowCanvas = ({ nodes, edges, onExportReady }) => {
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

    // Create dagre graph
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 });
    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes to graph
    nodes.forEach(node => {
      const width = node.type === 'decision' ? 150 : 180;
      const height = node.type === 'decision' ? 100 : 60;
      g.setNode(node.id, { label: node.label, width, height, type: node.type });
    });

    // Add edges to graph
    edges.forEach(edge => {
      g.setEdge(edge.from, edge.to, { label: edge.label });
    });

    // Calculate layout
    dagre.layout(g);

    // Calculate bounds for viewBox
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    // Draw nodes
    nodes.forEach(node => {
      const n = g.node(node.id);
      const x = n.x - n.width / 2;
      const y = n.y - n.height / 2;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + n.width);
      maxY = Math.max(maxY, y + n.height);

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

      if (n.type === 'decision') {
        // Draw diamond for decision nodes
        const cx = n.x;
        const cy = n.y;
        const hw = n.width / 2;
        const hh = n.height / 2;

        const diamond = rc.polygon([
          [cx, cy - hh],
          [cx + hw, cy],
          [cx, cy + hh],
          [cx - hw, cy]
        ], {
          fill: 'rgba(255, 248, 220, 0.5)',
          fillStyle: 'solid',
          stroke: '#333',
          strokeWidth: 2,
          roughness: 1.5
        });
        group.appendChild(diamond);

        // Add text
        const text = createWrappedText(n.label, cx, cy, n.width - 20);
        group.appendChild(text);
      } else {
        // Draw rounded rectangle for process nodes
        const rect = rc.rectangle(x, y, n.width, n.height, {
          fill: 'rgba(173, 216, 230, 0.5)',
          fillStyle: 'solid',
          stroke: '#333',
          strokeWidth: 2,
          roughness: 1.5,
          bowing: 2
        });
        group.appendChild(rect);

        // Add text
        const text = createWrappedText(n.label, n.x, n.y, n.width - 20);
        group.appendChild(text);
      }

      svg.appendChild(group);
    });

    // Draw edges
    edges.forEach(edge => {
      const e = g.edge(edge.from, edge.to);
      if (!e.points || e.points.length === 0) return;

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

      // Draw path
      const points = e.points.map(p => [p.x, p.y]);
      const line = rc.linearPath(points, {
        stroke: '#666',
        strokeWidth: 2,
        roughness: 1
      });
      group.appendChild(line);

      // Draw arrowhead at end
      const lastPoint = e.points[e.points.length - 1];
      const secondLastPoint = e.points[e.points.length - 2] || lastPoint;
      const angle = Math.atan2(lastPoint.y - secondLastPoint.y, lastPoint.x - secondLastPoint.x);

      const arrowSize = 10;
      const arrowPoints = [
        [lastPoint.x, lastPoint.y],
        [lastPoint.x - arrowSize * Math.cos(angle - Math.PI / 6), lastPoint.y - arrowSize * Math.sin(angle - Math.PI / 6)],
        [lastPoint.x - arrowSize * Math.cos(angle + Math.PI / 6), lastPoint.y - arrowSize * Math.sin(angle + Math.PI / 6)]
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
        const midIndex = Math.floor(e.points.length / 2);
        const midPoint = e.points[midIndex];
        const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        labelText.setAttribute('x', midPoint.x);
        labelText.setAttribute('y', midPoint.y - 5);
        labelText.setAttribute('text-anchor', 'middle');
        labelText.setAttribute('font-size', '12');
        labelText.setAttribute('fill', '#666');
        labelText.setAttribute('font-family', 'Comic Sans MS, cursive, sans-serif');
        labelText.textContent = edge.label;
        group.appendChild(labelText);
      }

      svg.appendChild(group);
    });

    // Set viewBox with padding
    const padding = 50;
    const vbWidth = maxX - minX + padding * 2;
    const vbHeight = maxY - minY + padding * 2;
    setViewBox({
      x: minX - padding,
      y: minY - padding,
      width: vbWidth,
      height: vbHeight
    });

    // Notify parent that export is ready
    if (onExportReady) {
      onExportReady(svg);
    }
  }, [nodes, edges, onExportReady]);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.1 : 0.9;
    const newWidth = viewBox.width * delta;
    const newHeight = viewBox.height * delta;

    // Keep zoom centered
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
    const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;

    const newX = svgX - (mouseX / rect.width) * newWidth;
    const newY = svgY - (mouseY / rect.height) * newHeight;

    setViewBox({ x: newX, y: newY, width: newWidth, height: newHeight });
  };

  const handleMouseDown = (e) => {
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e) => {
    if (!isPanning) return;

    const rect = svgRef.current.getBoundingClientRect();
    const dx = (e.clientX - panStart.x) * (viewBox.width / rect.width);
    const dy = (e.clientY - panStart.y) * (viewBox.height / rect.height);

    setViewBox({
      ...viewBox,
      x: viewBox.x - dx,
      y: viewBox.y - dy
    });

    setPanStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      style={{
        width: '100%',
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
