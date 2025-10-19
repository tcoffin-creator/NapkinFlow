# NapkinFlow

✏️ **Transform plain-text workflows into hand-drawn flowcharts**

NapkinFlow is a web application that takes plain-text workflow descriptions and automatically generates beautiful flowcharts in a hand-drawn napkin sketch style.

## Features

- 📝 **Simple Text Input**: Describe your workflow in plain text using intuitive syntax
- 🎨 **Hand-Drawn Style**: Flowcharts rendered with RoughJS for an authentic napkin sketch look
- 📐 **Auto-Layout**: Automatic graph layout using Dagre for clean, organized diagrams
- 💾 **Export Options**: Download your flowcharts as PNG or SVG files
- 🔒 **Privacy First**: Runs entirely in your browser - no backend, no data sent to servers
- ⚡ **Fast & Modern**: Built with React and Vite for instant updates

## Syntax

Use simple text patterns to create flowcharts:

- Use `→` or `->` to connect steps
- Add `?` after a label to create decision points (diamond shapes)
- Use `;` to separate branches
- Start conditional branches with `yes` or `no`

### Examples

**Simple workflow:**
```
Start → Process → End
```

**With decision points:**
```
Start → Qualify lead? yes → Book call; no → Send email → End
```

**Another example:**
```
Login → Check auth? yes → Dashboard; no → Error page
```

## Getting Started

### Prerequisites

- Node.js 16+ and npm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/tcoffin-creator/NapkinFlow.git
cd NapkinFlow
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Tech Stack

- **Frontend**: React 19 with Vite
- **Rendering**: RoughJS for hand-drawn style
- **Layout**: Dagre for automatic graph layout
- **Export**: html2canvas for PNG export, native SVG serialization
- **Styling**: CSS with custom components

## Local-Only Design

NapkinFlow runs entirely in your browser. No data is sent to any server, ensuring your workflows remain private and secure.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

