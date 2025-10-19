import { useState } from 'react';
import './WorkflowInput.css';

const EXAMPLE_TEXT = 'Start → Qualify lead? yes → Book call; no → Send email → End';

export default function WorkflowInput({ onWorkflowChange }) {
  const [text, setText] = useState(EXAMPLE_TEXT);

  const handleChange = (e) => {
    const newText = e.target.value;
    setText(newText);
    onWorkflowChange(newText);
  };

  const handleLoadExample = () => {
    setText(EXAMPLE_TEXT);
    onWorkflowChange(EXAMPLE_TEXT);
  };

  return (
    <div className="workflow-input-container">
      <div className="input-header">
        <h2>Workflow Description</h2>
        <button onClick={handleLoadExample} className="example-btn">
          Load Example
        </button>
      </div>
      
      <textarea
        className="workflow-input"
        value={text}
        onChange={handleChange}
        placeholder="Enter your workflow here...&#10;Example: Start → Qualify lead? yes → Book call; no → Send email → End"
        rows={6}
      />
      
      <div className="input-help">
        <p><strong>Syntax:</strong></p>
        <ul>
          <li>Use <code>→</code> or <code>-&gt;</code> to connect steps</li>
          <li>Add <code>?</code> for decision points</li>
          <li>Use <code>;</code> to separate branches</li>
          <li>Start branches with <code>yes</code> or <code>no</code></li>
        </ul>
      </div>
    </div>
  );
}
