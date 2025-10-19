import { useState } from 'react'
import WorkflowInput from './components/WorkflowInput'
import FlowchartCanvas from './components/FlowchartCanvas'
import './App.css'

function App() {
  const [workflowText, setWorkflowText] = useState('Start → Qualify lead? yes → Book call; no → Send email → End')

  return (
    <div className="app">
      <header className="app-header">
        <h1>✏️ NapkinFlow</h1>
        <p>Transform plain-text workflows into hand-drawn flowcharts</p>
      </header>
      
      <main className="app-main">
        <div className="app-grid">
          <div className="input-section">
            <WorkflowInput onWorkflowChange={setWorkflowText} />
          </div>
          
          <div className="canvas-section">
            <FlowchartCanvas workflowText={workflowText} />
          </div>
        </div>
      </main>
      
      <footer className="app-footer">
        <p>Built with React, Vite, RoughJS, and Dagre • Local-only, no backend required</p>
      </footer>
    </div>
  )
}

export default App
