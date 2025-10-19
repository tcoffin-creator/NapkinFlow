import { useEffect, useRef, useState } from 'react';
import { parseWorkflow } from '../utils/flowchartParser';
import { calculateLayout } from '../utils/layoutEngine';
import { FlowchartRenderer } from '../utils/flowchartRenderer';
import html2canvas from 'html2canvas';
import './FlowchartCanvas.css';

export default function FlowchartCanvas({ workflowText }) {
  const canvasRef = useRef(null);
  const [renderer, setRenderer] = useState(null);
  const [layout, setLayout] = useState(null);

  useEffect(() => {
    if (canvasRef.current && !renderer) {
      setRenderer(new FlowchartRenderer(canvasRef.current));
    }
  }, [renderer]);

  useEffect(() => {
    if (!renderer || !workflowText) return;

    try {
      // Parse workflow text
      const { nodes, edges } = parseWorkflow(workflowText);
      
      if (nodes.length === 0) {
        renderer.clear();
        setLayout(null);
        return;
      }

      // Calculate layout
      const newLayout = calculateLayout(nodes, edges);
      setLayout(newLayout);

      // Render flowchart
      renderer.render(newLayout);
    } catch (error) {
      console.error('Error rendering flowchart:', error);
    }
  }, [renderer, workflowText]);

  const handleExportPNG = async () => {
    if (!canvasRef.current) return;
    
    try {
      // Use html2canvas for better quality
      const canvas = await html2canvas(canvasRef.current, {
        backgroundColor: '#ffffff',
        scale: 2
      });
      
      const link = document.createElement('a');
      link.download = 'flowchart.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Error exporting PNG:', error);
    }
  };

  const handleExportSVG = () => {
    if (!renderer || !layout) return;

    try {
      const svgContent = renderer.exportAsSVG(layout);
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.download = 'flowchart.svg';
      link.href = url;
      link.click();
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting SVG:', error);
    }
  };

  return (
    <div className="flowchart-canvas-container">
      <div className="canvas-wrapper">
        <canvas ref={canvasRef} className="flowchart-canvas" />
      </div>
      
      {layout && layout.nodes.length > 0 && (
        <div className="export-buttons">
          <button onClick={handleExportPNG} className="export-btn">
            Export as PNG
          </button>
          <button onClick={handleExportSVG} className="export-btn">
            Export as SVG
          </button>
        </div>
      )}
    </div>
  );
}
