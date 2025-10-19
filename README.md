# NapkinFlow

A minimal, local-only React + Vite web app that converts plain-text workflow descriptions into hand-drawn-style flowcharts.

## Features

- 🎨 Hand-drawn flowchart style using RoughJS
- 📊 Automatic layout with dagre
- 🖱️ Interactive pan and zoom (mouse wheel + drag)
- 💾 Export to SVG and PNG formats
- 🚀 Fully client-side, no backend required

## Usage

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open your browser and navigate to the URL shown in the terminal (typically `http://localhost:5173`).

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Workflow Syntax

Enter workflow descriptions using arrows and text labels:

### Basic Syntax

- Use `->` or `→` for connections
- End node labels with `?` for decision nodes
- Separate branches with `;`

### Example Workflows

**Simple sequence:**
```
Start → Process data → Save → End
```

**With decision:**
```
Start → Qualify lead? yes → Book call; no → Send email → End
```

**With bracketed labels:**
```
Start → Check status? [approved] → Process; [rejected] → Notify → End
```

**Edge labels:**
```
Start → Validate? yes → Continue; no → Retry → End
```

## Controls

- **Render**: Generate flowchart from input text
- **Example**: Load a sample workflow
- **Export SVG**: Download as SVG file
- **Export PNG**: Download as PNG image
- **Pan**: Click and drag on the canvas
- **Zoom**: Use mouse wheel to zoom in/out

## Technology Stack

- React 18
- Vite
- RoughJS (hand-drawn style)
- Dagre (graph layout)

## License

MIT
