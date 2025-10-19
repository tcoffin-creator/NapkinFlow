/**
 * Parse plain-text workflow description into nodes and edges.
 * 
 * Supports:
 * - Both arrow forms: -> and →
 * - Edge labels: "yes -> Next" or "[yes] -> Next"
 * - Branches separated by semicolons ";"
 * - Decision nodes with trailing '?'
 */

const EDGE_LABEL_KEYWORDS = ['yes', 'no', 'true', 'false', 'ok', 'cancel'];

export function parseWorkflow(text) {
  const nodes = [];
  const edges = [];
  const nodeMap = new Map(); // Track nodes by label to avoid duplicates

  if (!text || !text.trim()) {
    return { nodes, edges };
  }

  // Normalize arrows to ->
  const normalized = text.replace(/→/g, '->');

  // Split by semicolons to get separate branches
  const branches = normalized.split(';').map(b => b.trim()).filter(b => b);

  // Track the last decision node across branches for connecting alternative paths
  let lastDecisionNode = null;

  branches.forEach((branch, branchIndex) => {
    // Split by arrows to get tokens
    let tokens = branch.split(/\s*->\s*/).map(t => t.trim()).filter(t => t);

    // Pre-process tokens to separate decision nodes from following edge labels and bracketed labels
    const processedTokens = [];
    tokens.forEach((token, i) => {
      // Check if token ends with ? followed by a bracketed label like "Check? [approved]"
      const decisionBracketMatch = token.match(/^(.+\?)\s+\[([^\]]+)\]$/);
      if (decisionBracketMatch) {
        processedTokens.push(decisionBracketMatch[1].trim());
        processedTokens.push(`[${decisionBracketMatch[2].trim()}]`);
        return;
      }
      
      // Check if token ends with ? followed by an edge label like "Check? yes"
      const edgeKeywordsPattern = EDGE_LABEL_KEYWORDS.join('|');
      const decisionMatch = token.match(new RegExp(`^(.+\\?)\\s+(${edgeKeywordsPattern})$`, 'i'));
      if (decisionMatch) {
        // Split into decision node and edge label
        processedTokens.push(decisionMatch[1].trim());
        processedTokens.push(decisionMatch[2].trim());
      } else {
        processedTokens.push(token);
      }
    });

    let previousNodeId = branchIndex > 0 ? lastDecisionNode : null;
    let pendingEdgeLabel = null;

    processedTokens.forEach((token, index) => {
      const tokenLower = token.toLowerCase();
      const isEdgeLabel = EDGE_LABEL_KEYWORDS.includes(tokenLower);
      
      // Check if token is a bracketed label like "[yes]" or "[approved]"
      const bracketOnlyMatch = token.match(/^\[([^\]]+)\]$/);
      if (bracketOnlyMatch) {
        pendingEdgeLabel = bracketOnlyMatch[1].trim();
        if (branchIndex > 0 && index === 0) {
          previousNodeId = lastDecisionNode;
        }
        return;
      }

      // If this token is an edge label, store it and skip creating a node
      if (isEdgeLabel && (previousNodeId !== null || (branchIndex > 0 && index === 0))) {
        pendingEdgeLabel = token;
        if (branchIndex > 0 && index === 0) {
          previousNodeId = lastDecisionNode;
        }
        return;
      }

      // Check if this token starts with a bracketed label followed by content like "[yes] Node"
      const bracketMatch = token.match(/^\[([^\]]+)\]\s+(.+)$/);
      let edgeLabel = pendingEdgeLabel;
      let nodeLabel = token;

      if (bracketMatch) {
        edgeLabel = bracketMatch[1].trim();
        nodeLabel = bracketMatch[2].trim();
      }

      // Clear pending edge label after use
      pendingEdgeLabel = null;

      // Determine node type
      const isDecision = nodeLabel.endsWith('?');
      const cleanLabel = isDecision ? nodeLabel.slice(0, -1).trim() : nodeLabel;

      // Create stable node ID
      const nodeId = getOrCreateNode(nodes, nodeMap, cleanLabel, isDecision ? 'decision' : 'process');

      // Create edge from previous node
      if (previousNodeId !== null) {
        edges.push({
          from: previousNodeId,
          to: nodeId,
          label: edgeLabel
        });
      }

      previousNodeId = nodeId;
      
      // Track last decision node for branch continuation
      if (isDecision) {
        lastDecisionNode = nodeId;
      }
    });
  });

  return { nodes, edges };
}

function getOrCreateNode(nodes, nodeMap, label, type) {
  // Use label as the basis for the ID, but handle duplicates
  if (nodeMap.has(label)) {
    return nodeMap.get(label);
  }

  const id = `node_${nodes.length}`;
  nodeMap.set(label, id);
  nodes.push({ id, label, type });
  return id;
}
