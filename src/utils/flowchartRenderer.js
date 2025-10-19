import rough from 'roughjs';

// Constants for rendering calculations
const APPROX_CHAR_WIDTH = 7; // Approximate character width for SVG text (canvas uses ctx.measureText for accuracy)
const EPSILON = 0.01; // Small value for floating point comparisons

/**
 * Render flowchart using RoughJS for hand-drawn napkin style
 */
export class FlowchartRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rc = rough.canvas(canvas);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(layout) {
    this.clear();
    
    // Set canvas size
    this.canvas.width = layout.width + 100;
    this.canvas.height = layout.height + 100;
    
    // Draw edges first (so they appear behind nodes)
    layout.edges.forEach(edge => {
      this.drawEdge(edge, layout.nodes);
    });
    
    // Draw nodes
    layout.nodes.forEach(node => {
      this.drawNode(node);
    });
  }

  drawNode(node) {
    const options = {
      roughness: 1.5,
      bowing: 2,
      stroke: '#333',
      strokeWidth: 2,
      fill: '#fff',
      fillStyle: 'solid'
    };

    if (node.type === 'decision') {
      // Draw diamond for decision nodes
      this.drawDiamond(node.x, node.y, node.width, node.height, options);
    } else {
      // Draw rectangle for process nodes
      this.rc.rectangle(
        node.x - node.width / 2,
        node.y - node.height / 2,
        node.width,
        node.height,
        options
      );
    }

    // Draw label
    this.ctx.fillStyle = '#333';
    this.ctx.font = '14px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.wrapText(node.label, node.x, node.y, node.width - 20);
  }

  drawDiamond(x, y, width, height, options) {
    const points = [
      [x, y - height / 2],           // top
      [x + width / 2, y],            // right
      [x, y + height / 2],           // bottom
      [x - width / 2, y]             // left
    ];
    
    this.rc.polygon(points, options);
  }

  drawEdge(edge, nodes) {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    
    if (!sourceNode || !targetNode) return;

    // Calculate edge start and end points
    const start = this.getNodeEdgePoint(sourceNode, targetNode);
    const end = this.getNodeEdgePoint(targetNode, sourceNode);

    // Draw arrow with RoughJS
    this.rc.line(start.x, start.y, end.x, end.y, {
      roughness: 1,
      bowing: 1,
      stroke: '#666',
      strokeWidth: 2
    });

    // Draw arrowhead
    this.drawArrowhead(start, end);

    // Draw edge label if exists
    if (edge.label) {
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      
      this.ctx.fillStyle = '#fff';
      this.ctx.fillRect(midX - 20, midY - 10, 40, 20);
      
      this.ctx.fillStyle = '#666';
      this.ctx.font = '12px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(edge.label, midX, midY);
    }
  }

  getNodeEdgePoint(fromNode, toNode) {
    // Calculate the point on the node border closest to the other node
    const dx = toNode.x - fromNode.x;
    const dy = toNode.y - fromNode.y;
    const angle = Math.atan2(dy, dx);
    
    if (fromNode.type === 'decision') {
      // For diamond, use a simplified approach
      const radius = Math.max(fromNode.width, fromNode.height) / 2;
      return {
        x: fromNode.x + Math.cos(angle) * radius * 0.6,
        y: fromNode.y + Math.sin(angle) * radius * 0.6
      };
    } else {
      // For rectangle, find intersection with the appropriate edge
      const halfWidth = fromNode.width / 2;
      const halfHeight = fromNode.height / 2;
      
      // Handle vertical and horizontal cases separately to avoid division by zero
      if (Math.abs(dx) < EPSILON) {
        // Vertical line - use top or bottom edge
        const y = dy > 0 ? fromNode.y + halfHeight : fromNode.y - halfHeight;
        return { x: fromNode.x, y };
      }
      
      if (Math.abs(dy) < EPSILON) {
        // Horizontal line - use left or right edge
        const x = dx > 0 ? fromNode.x + halfWidth : fromNode.x - halfWidth;
        return { x, y: fromNode.y };
      }
      
      // Determine which edge to use based on angle
      const tan = Math.abs(dy / dx);
      const threshold = halfHeight / halfWidth;
      
      if (tan > threshold) {
        // Top or bottom edge
        const y = dy > 0 ? fromNode.y + halfHeight : fromNode.y - halfHeight;
        const x = fromNode.x + (halfHeight / tan) * (dx > 0 ? 1 : -1);
        return { x, y };
      } else {
        // Left or right edge
        const x = dx > 0 ? fromNode.x + halfWidth : fromNode.x - halfWidth;
        const y = fromNode.y + (halfWidth * tan) * (dy > 0 ? 1 : -1);
        return { x, y };
      }
    }
  }

  drawArrowhead(start, end) {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const arrowLength = 12;
    const arrowAngle = Math.PI / 6;

    const x1 = end.x - arrowLength * Math.cos(angle - arrowAngle);
    const y1 = end.y - arrowLength * Math.sin(angle - arrowAngle);
    const x2 = end.x - arrowLength * Math.cos(angle + arrowAngle);
    const y2 = end.y - arrowLength * Math.sin(angle + arrowAngle);

    this.rc.line(end.x, end.y, x1, y1, {
      roughness: 1,
      stroke: '#666',
      strokeWidth: 2
    });
    this.rc.line(end.x, end.y, x2, y2, {
      roughness: 1,
      stroke: '#666',
      strokeWidth: 2
    });
  }

  wrapText(text, x, y, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = this.ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    
    if (currentLine) {
      lines.push(currentLine);
    }

    const lineHeight = 16;
    const startY = y - ((lines.length - 1) * lineHeight) / 2;

    lines.forEach((line, i) => {
      this.ctx.fillText(line, x, startY + i * lineHeight);
    });
  }

  // Export methods
  exportAsPNG() {
    return this.canvas.toDataURL('image/png');
  }

  exportAsSVG(layout) {
    // Create SVG manually since RoughJS canvas doesn't directly export SVG
    // We'll use rough's SVG generator instead
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', layout.width + 100);
    svg.setAttribute('height', layout.height + 100);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    
    const rs = rough.svg(svg);
    
    // Draw edges
    layout.edges.forEach(edge => {
      const sourceNode = layout.nodes.find(n => n.id === edge.source);
      const targetNode = layout.nodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode) {
        const start = this.getNodeEdgePoint(sourceNode, targetNode);
        const end = this.getNodeEdgePoint(targetNode, sourceNode);
        
        const line = rs.line(start.x, start.y, end.x, end.y, {
          roughness: 1,
          bowing: 1,
          stroke: '#666',
          strokeWidth: 2
        });
        svg.appendChild(line);
        
        // Arrow head
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const arrowLength = 12;
        const arrowAngle = Math.PI / 6;
        const x1 = end.x - arrowLength * Math.cos(angle - arrowAngle);
        const y1 = end.y - arrowLength * Math.sin(angle - arrowAngle);
        const x2 = end.x - arrowLength * Math.cos(angle + arrowAngle);
        const y2 = end.y - arrowLength * Math.sin(angle + arrowAngle);
        
        svg.appendChild(rs.line(end.x, end.y, x1, y1, {
          roughness: 1,
          stroke: '#666',
          strokeWidth: 2
        }));
        svg.appendChild(rs.line(end.x, end.y, x2, y2, {
          roughness: 1,
          stroke: '#666',
          strokeWidth: 2
        }));
        
        // Edge label
        if (edge.label) {
          const midX = (start.x + end.x) / 2;
          const midY = (start.y + end.y) / 2;
          
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', midX);
          text.setAttribute('y', midY);
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('dominant-baseline', 'middle');
          text.setAttribute('font-size', '12');
          text.setAttribute('fill', '#666');
          text.textContent = edge.label;
          svg.appendChild(text);
        }
      }
    });
    
    // Draw nodes
    layout.nodes.forEach(node => {
      const options = {
        roughness: 1.5,
        bowing: 2,
        stroke: '#333',
        strokeWidth: 2,
        fill: '#fff',
        fillStyle: 'solid'
      };

      if (node.type === 'decision') {
        const points = [
          [node.x, node.y - node.height / 2],
          [node.x + node.width / 2, node.y],
          [node.x, node.y + node.height / 2],
          [node.x - node.width / 2, node.y]
        ];
        const diamond = rs.polygon(points, options);
        svg.appendChild(diamond);
      } else {
        const rect = rs.rectangle(
          node.x - node.width / 2,
          node.y - node.height / 2,
          node.width,
          node.height,
          options
        );
        svg.appendChild(rect);
      }
      
      // Node label with text wrapping
      const words = node.label.split(' ');
      const maxWidth = node.width - 20;
      const lines = [];
      let currentLine = '';
      
      // Simple text wrapping for SVG
      words.forEach(word => {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        // Approximate text width using constant
        const estimatedWidth = testLine.length * APPROX_CHAR_WIDTH;
        
        if (estimatedWidth > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      });
      
      if (currentLine) {
        lines.push(currentLine);
      }
      
      // Draw text lines
      const lineHeight = 16;
      const startY = node.y - ((lines.length - 1) * lineHeight) / 2;
      
      lines.forEach((line, i) => {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', node.x);
        text.setAttribute('y', startY + i * lineHeight);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('font-size', '14');
        text.setAttribute('fill', '#333');
        text.textContent = line;
        svg.appendChild(text);
      });
    });
    
    const serializer = new XMLSerializer();
    return serializer.serializeToString(svg);
  }
}
