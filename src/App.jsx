import { useState, useCallback, useEffect, useRef } from 'react';
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
  const [lastAIPrompt, setLastAIPrompt] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);

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
      if (e.key === 'Escape') {
        setShowInstructions(false);
        setExportOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setExportOpen(false);
      }
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const exportSVGWithPadding = (padding = 24) => {
    if (!svgElement) {
      alert('Please render a flowchart first');
      return null;
    }

    // Clone and wrap content to add padding
    const svgClone = svgElement.cloneNode(true);
    const viewBox = svgElement.getAttribute('viewBox');
    if (!viewBox) {
      alert('Unable to determine SVG dimensions');
      return null;
    }
    const [, , widthStr, heightStr] = viewBox.split(' ');
    const width = Number(widthStr);
    const height = Number(heightStr);

    const paddedWidth = Math.ceil(width + padding);
    const paddedHeight = Math.ceil(height + padding);

    // Create a new svg wrapper
    const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wrapper.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    wrapper.setAttribute('width', paddedWidth);
    wrapper.setAttribute('height', paddedHeight);
    wrapper.setAttribute('viewBox', `0 0 ${paddedWidth} ${paddedHeight}`);

    // Add white background
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', 'white');
    wrapper.appendChild(rect);

    // Offset original content by half padding
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${padding / 2}, ${padding / 2})`);
    // move children of svgClone into g
    while (svgClone.firstChild) {
      g.appendChild(svgClone.firstChild);
    }
    wrapper.appendChild(g);

    return { wrapper, width: paddedWidth, height: paddedHeight };
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportSVG = () => {
    const res = exportSVGWithPadding(28);
    if (!res) return;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(res.wrapper);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, 'flowchart.svg');
    setExportOpen(false);
  };

  const exportPNG = () => {
    const res = exportSVGWithPadding(28);
    if (!res) return;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(res.wrapper);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const SCALE = 3; // 3x resolution for crisp exports

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = res.width * SCALE;
      canvas.height = res.height * SCALE;
      const ctx = canvas.getContext('2d');

      // Scale context for high-res rendering
      ctx.scale(SCALE, SCALE);

      // White background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, res.width, res.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        downloadBlob(blob, 'flowchart.png');
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('Failed to render PNG for export.');
    };
    img.src = url;
    setExportOpen(false);
  };

  const exportPDF = async () => {
    const res = exportSVGWithPadding(28);
    if (!res) return;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(res.wrapper);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const SCALE = 3; // 3x resolution for crisp PDF

    const img = new Image();
    img.onload = async () => {
      // Create canvas to get image data at higher resolution
      const canvas = document.createElement('canvas');
      canvas.width = res.width * SCALE;
      canvas.height = res.height * SCALE;
      const ctx = canvas.getContext('2d');
      ctx.scale(SCALE, SCALE);
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, res.width, res.height);
      ctx.drawImage(img, 0, 0);
      // Use jsPDF if available
      try {
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({
          unit: 'px',
          format: [res.width, res.height],
          orientation: res.width > res.height ? 'landscape' : 'portrait'
        });
        const dataURL = canvas.toDataURL('image/png');
        pdf.addImage(dataURL, 'PNG', 0, 0, res.width, res.height);
        pdf.save('flowchart.pdf');
      } catch (err) {
        // fallback: open PNG in new tab and ask user to print to PDF
        const dataURL = canvas.toDataURL('image/png');
        const w = window.open('');
        if (w) {
          w.document.body.style.margin = '0';
          const imgEl = w.document.createElement('img');
          imgEl.src = dataURL;
          imgEl.style.maxWidth = '100%';
          w.document.body.appendChild(imgEl);
        } else {
          alert('Unable to open a new window for PDF fallback. Install jspdf (npm install jspdf) for direct PDF export.');
        }
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('Failed to render PDF for export.');
    };
    img.src = url;
    setExportOpen(false);
  };

  async function handleAIGenerate() {
    if (loading) return;
    setLoading(true);
    try {
      const prompt = inputText && inputText.trim().length > 0
        ? inputText.trim()
        : 'Create a concise 6-step flowchart for a generic small project';

      // Save last AI prompt for title
      setLastAIPrompt(prompt);

      // generateFlowchartViaProxy calls your /api/generate Pages Function and returns a graph { nodes, edges }
      const graph = await generateFlowchartViaProxy(prompt);

      // Basic safety check
      if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
        throw new Error('Invalid graph returned from AI');
      }

      setParsedData(graph);
    } catch (err) {
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
              Instructions
            </button>

            <div className="export-container" ref={exportRef} style={{ display: 'inline-block', position: 'relative' }}>
              <button
                className="btn btn-export"
                onClick={() => setExportOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={exportOpen}
              >
                Export ▾
              </button>
              {exportOpen && (
                <div role="menu" className="export-dropdown" style={{
                  position: 'absolute',
                  right: 0,
                  marginTop: 6,
                  background: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  zIndex: 40,
                }}>
                  <button role="menuitem" className="btn" onClick={exportPNG} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px' }}>Export PNG</button>
                  <button role="menuitem" className="btn" onClick={exportSVG} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px' }}>Export SVG</button>
                  <button role="menuitem" className="btn" onClick={exportPDF} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px' }}>Export PDF</button>
                </div>
              )}
            </div>

          </div>
        </div>

        <div className="canvas-container" style={{ marginTop: 12 }}>
          {parsedData.nodes.length > 0 ? (
            <FlowCanvas
              nodes={parsedData.nodes}
              edges={parsedData.edges}
              onExportReady={handleExportReady}
              aiTitle={lastAIPrompt ? `AI: ${lastAIPrompt}` : ''}
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
          aria-label="Workflow instructions"
          onClick={(e) => { if (e.target === e.currentTarget) setShowInstructions(false); }}
        >
          <div className="modal-box" role="document" style={{ maxWidth: 720 }}>
            <button
              className="modal-close"
              aria-label="Close instructions"
              onClick={() => setShowInstructions(false)}
            >✕</button>
            <h2>Instructions & Syntax</h2>
            <p>Use the following simple syntax to create flowcharts. The buttons are:</p>
            <ul>
              <li><strong>Render</strong> — parse the text and render a flowchart locally.</li>
              <li><strong>AI Generate</strong> — ask the AI to produce a graph from your prompt and render it. The AI will follow the same syntax below.</li>
              <li><strong>Example</strong> — loads a sample workflow.</li>
              <li><strong>Instructions</strong> — this popup (what you're viewing now).</li>
              <li><strong>Export</strong> — download the current flowchart (PNG, SVG, PDF).</li>
            </ul>

            <h3>Workflow syntax</h3>
            <ul>
              <li>Use <code>{"->"}</code> or <code>→</code> for connections (e.g., <code>Start → Step</code>).</li>
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
            <p>The AI is instructed to output a graph JSON that follows the same conventions so branches and merges come out as expected.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
