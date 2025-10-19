/**
 * Parse plain-text workflow description into nodes and edges
 * Example input: "Start → Qualify lead? yes → Book call; no → Send email → End."
 */

export function parseWorkflow(text) {
  if (!text || !text.trim()) {
    return { nodes: [], edges: [] };
  }

  const nodes = [];
  const edges = [];
  const nodeMap = new Map(); // Track unique nodes

  // Split by semicolons to handle branching paths
  const paths = text.split(';').map(p => p.trim()).filter(p => p);

  paths.forEach((path) => {
    // Split by arrows to get sequence
    const parts = path.split(/→|->/).map(p => p.trim()).filter(p => p);
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      // Check for decision node (ends with ?)
      const isDecision = part.includes('?');
      
      // Extract node label and condition
      let nodeLabel = part;
      let condition = null;
      
      if (i > 0 && /^(yes|no|true|false)\s+(.+)$/i.test(part)) {
        // This is a conditional branch like "yes → Book call"
        const match = part.match(/^(yes|no|true|false)\s+(.+)$/i);
        condition = match[1].toLowerCase();
        nodeLabel = match[2].trim();
      }
      
      // Generate unique node ID
      const nodeId = nodeLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
      
      // Add node if not already exists
      if (!nodeMap.has(nodeId)) {
        nodeMap.set(nodeId, {
          id: nodeId,
          label: nodeLabel,
          type: isDecision ? 'decision' : 'process'
        });
        nodes.push(nodeMap.get(nodeId));
      }
      
      // Add edge from previous node
      if (i > 0) {
        const prevPart = parts[i - 1];
        let prevLabel = prevPart;
        let edgeCondition = null;
        
        // Check if previous was decision and current has condition
        if (prevPart.includes('?')) {
          prevLabel = prevPart.replace('?', '').trim();
          edgeCondition = condition;
        }
        
        const prevNodeId = prevLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
        
        // Avoid duplicate edges
        const edgeKey = `${prevNodeId}-${nodeId}-${edgeCondition || ''}`;
        if (!edges.some(e => `${e.source}-${e.target}-${e.label || ''}` === edgeKey)) {
          edges.push({
            source: prevNodeId,
            target: nodeId,
            label: edgeCondition
          });
        }
      }
    }
  });

  return { nodes, edges };
}
