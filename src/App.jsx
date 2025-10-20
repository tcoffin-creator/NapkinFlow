import { useState, useCallback, useEffect } from 'react';
import FlowCanvas from './FlowCanvas';
import { parseWorkflow } from './parser';
import { generateFlowchartViaProxy } from './ai';
import './styles.css';

const EXAMPLE_TEXT = 'Start → Qualify lead? yes → Book call; no → Send email → End';

function App() {
  const [inputText, setInputText] = useState('');
  const [parsedData, setParsedData] = useState({ nodes: [], edges: [] });
  const [svgElement, setSvgElement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const handleRender = () => {
    const data = parseWorkflow(inputText);
    setParsedData(data);
  };

  const handleExample = () => {
    setInputText(EXAMPLE_TEXT);
  };

  const handleExportReady = useCallback((svg) => {
    setSvgElement(svg);
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setShowInstructions(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const exportSVG = () => {
    if (!svgElement) {
      alert('Please render a flowchart first');
      return;
    }

    const svgClone = svgElement.cloneNode(true);
    
    // Set explicit width and height for export
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
      const [, , width, height] = viewBox.split(' ').map(Number);
      svgClone.setAttribute('width', width);
      svgClone.setAttribute('height', height);
    }

    // Add white background
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', '#fefefe');
    svgClone.insertBefore(rect, svgClone.firstChild);

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgClone);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'flowchart.svg';
    link.click();

    URL.revokeObjectURL(url);
  };

  const exportPNG = () => {
    if (!svgElement) {
      alert('Please render a flowchart first');
      return;
    }

    const svgClone = svgElement.cloneNode(true);
    
    // Get viewBox dimensions
    const viewBox = svgElement.getAttribute('viewBox');
    if (!viewBox) {
      alert('Unable to determine SVG dimensions');
      return;
    }

    const [, , width, height] = viewBox.split(' ').map(Number);
    svgClone.setAttribute('width', width);
    svgClone.setAttribute('height', height);

    // Add white background
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', 'white');
    svgClone.insertBefore(rect, svgClone.firstChild);

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgClone);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      // Fill with white background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);
      
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        const pngUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = 'flowchart.png';
        link.click();

        URL.revokeObjectURL(pngUrl);
        URL.revokeObjectURL(url);
      });
    };

    img.src = url;
  };

  async function handleAIGenerate() {
    if (loading) return;
    setLoading(true);
    try {
      const prompt = inputText && inputText.trim().length > 0
        ? inputText.trim()
        : 'Create a concise 6-step flowchart for a generic small project';

      // generateFlowchartViaProxy calls your /api/generate Pages Function and returns a graph { nodes, edges }
      const graph = await generateFlowchartViaProxy(prompt);

      // Basic safety check
      if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
        throw new Error('Invalid graph returned from AI');
      }

      setParsedData(graph);
    } catch (err) {
      // show a helpful error; if the proxy returned details you'll see them in err.message
      alert('AI generation failed: ' + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>NapkinFlow</h1>
        <p>Convert text to hand-drawn flowcharts</p>
      </header>

      <div className="container">
        <div className="controls">
          <textarea
            className="input-area"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Enter workflow description (e.g., Start → Qualify lead? yes → Book call; no → Send email → End)"
            rows={4}
          />
          <div className="button-group">
            <button onClick={handleRender} className="btn btn-primary" disabled={loading}>
              Render
            </button>
            <button onClick={handleAIGenerate} className="btn btn-primary" disabled={loading}>
              {loading ? 'Generating...' : 'AI Generate'}
            </button>
            <button onClick={handleExample} className="btn btn-secondary" disabled={loading}>
              Example
            </button>
            <button onClick={() => setShowInstructions(true)} className="btn btn-secondary" disabled={loading}>
              Syntax
            </button>
            <button onClick={exportSVG} className="btn btn-export">
              Export SVG
            </button>
            <button onClick={exportPNG} className="btn btn-export">
              Export PNG
            </button>
          </div>
        </div>

        <div className="canvas-container">
          {parsedData.nodes.length > 0 ? (
            <FlowCanvas
              nodes={parsedData.nodes}
              edges={parsedData.edges}
              onExportReady={handleExportReady}
            />
          ) : (
            <div className="placeholder">
              <p>Enter a workflow description and click "Render" or use "AI Generate" to let the AI produce one</p>
              <p className="hint">Tip: Use "Example" to see a sample workflow</p>
            </div>
          )}
        </div>
      </div>

      <footer className="footer">
        <p>Pan: Click and drag | Zoom: Mouse wheel</p>
      </footer>

      {showInstructions && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Workflow syntax instructions"
          onClick={(e) => { if (e.target === e.currentTarget) setShowInstructions(false); }}
        >
          <div className="modal-box" role="document">
            <button
              className="modal-close"
              aria-label="Close instructions"
              onClick={() => setShowInstructions(false)}
            >✕</button>
            <h2>Workflow syntax</h2>
            <p>Use the following simple syntax to create flowcharts:</p>
            <ul>
              <li>Use <code>-></code> or <code>→</code> for connections (e.g., <code>Start → Step</code>).</li>
              <li>End node labels with <code>?</code> for decision nodes (e.g., <code>Approve?</code>).</li>
              <li>Separate alternative branches with <code>;</code> (e.g., <code>A → B; C → D</code>).</li>
              <li>Edge labels: place small labels like <code>yes</code> or <code>no</code> after a decision, or use bracketed labels like <code>[approved]</code> before a node.</li>
              <li>To have branches converge, reuse the exact same node label where they should join (e.g., both branches end with <code>Review</code>).</li>
            </ul>
            <h3>Examples</h3>
            <pre style={{ whiteSpace: 'pre-wrap', background: '#fff9d9', padding: '8px', borderRadius: '6px' }}>
Start → Qualify lead? yes → Book call; no → Send email → Review → End

Start → A? yes → X; no → Y → X → End
            </pre>
            <p>
              These rules are also used by the AI when you click "AI Generate" — the assistant is instructed to produce a JSON graph that follows the same conventions.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;