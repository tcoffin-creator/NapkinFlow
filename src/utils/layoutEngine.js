import dagre from 'dagre';

/**
 * Calculate layout for nodes using dagre
 */
export function calculateLayout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  
  // Set graph options
  g.setGraph({
    rankdir: 'TB', // Top to bottom
    nodesep: 80,
    ranksep: 100,
    marginx: 40,
    marginy: 40
  });
  
  g.setDefaultEdgeLabel(() => ({}));
  
  // Add nodes to graph
  nodes.forEach(node => {
    const width = node.type === 'decision' ? 120 : 150;
    const height = node.type === 'decision' ? 80 : 60;
    g.setNode(node.id, { width, height, label: node.label });
  });
  
  // Add edges to graph
  edges.forEach(edge => {
    g.setEdge(edge.source, edge.target);
  });
  
  // Calculate layout
  dagre.layout(g);
  
  // Extract positioned nodes
  const positionedNodes = nodes.map(node => {
    const dagreNode = g.node(node.id);
    return {
      ...node,
      x: dagreNode.x,
      y: dagreNode.y,
      width: dagreNode.width,
      height: dagreNode.height
    };
  });
  
  // Get graph dimensions for canvas sizing
  const graphDimensions = g.graph();
  
  return {
    nodes: positionedNodes,
    edges,
    width: graphDimensions.width || 800,
    height: graphDimensions.height || 600
  };
}
