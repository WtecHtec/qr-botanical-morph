# QR Botanical Morph

An interactive 3D WebGL experience that morphs any QR code into a living, seasonal botanical tree—complete with procedural trunks, custom foliage shaders, dynamic weather, wildlife, ambient soundscapes, and pure-frontend `.MP4` & Live Photo (`.JPG` + `.MOV`) export.

---

## Features

- **Smooth 3D Tree ↔ 2D QR Morphing**
  - Click the scene, press `Space`, or drag the progress slider to smoothly transition between a scannable 2D QR code and a 3D living tree.
  - Switch between **3D Side View** and **Top-Down Canopy View** to see how the foliage aligns with the underlying QR silhouette.
- **Four Distinct Botanical Species**
  - **Evergreen (`常青树`)**: Dense layered canopy with serrated foliage.
  - **Peach Blossom (`桃花树`)**: Open-vase trunk, lenticel mahogany bark, drooping shoots, notched pink blossoms, and tender sprouts.
  - **Japanese Maple (`红枫树`)**: Twin-forked silver-grey trunk, horizontal cloud strata, and 7-lobed incised leaves with vertical/radial autumn gradients.
  - **Winter Plum (`腊梅树`)**: Gnarled bonsai trunk with fissured charcoal bark, angled spurs, and waxy blossoms on ink-brush twigs.
- **Seasons, Weather & Living Ecosystem**
  - **4 Seasons**: Spring, Summer, Autumn, and Winter color & atmosphere transitions.
  - **Weather & Wind**: Clear sky, gentle rain, and snowfall particles, plus 3 wind intensities (`微风`, `自然`, `落英`) driving falling leaves/petals.
  - **Wildlife & Audio**: Animated butterflies, flocking birds, procedural meadow ground, and synthesized Web Audio birdsong & rainfall ambience.
- **Custom QR Input & Pure-Frontend Export**
  - Upload any QR code image and sample it directly on the client.
  - Export a crisp **2D QR `.PNG`**.
  - Render and export **Tree → QR** or **QR → Tree** transition animations directly in the browser:
    - **Live Photo Bundle (`.ZIP`)**: Contains a paired cover `.JPG` and motion `.MOV` encoded client-side via WebCodecs H.264.
    - **Standard Video (`.MP4`)**: In-browser preview, direct download, and Web Share support (with `MediaRecorder` fallback where needed).
- **Desktop & Mobile Ready**
  - Adaptive portrait camera framing, touch-friendly controls, mobile bottom thumb bar with an expandable drawer, and bottom-sheet export modal.

---

## Tech Stack

- **Framework**: React 19, TypeScript, Vite
- **3D & Shaders**: Three.js (custom GLSL vertex/fragment shaders, instanced botanical sprite atlas)
- **Styling**: Tailwind CSS v4, Lucide React
- **Client Media & Audio**: WebCodecs (`VideoEncoder` H.264), `MediaRecorder` fallback, Web Audio API

---

## Getting Started

### Prerequisites

- Node.js 18+ (or Bun)

### Installation & Development

```bash
# Install dependencies
npm install

# Start the development server on port 3000
npm run dev
```

Open `http://localhost:3000` in a modern desktop or mobile browser with WebGL enabled.

### Build & Type Check

```bash
# Type check
npm run lint

# Production build (outputs to dist/)
npm run build

# Preview production build
npm run preview
```

---

## Project Structure

```text
.
├── index.html
├── metadata.json
├── package.json
├── vite.config.ts
└── src
    ├── App.tsx                       # Main application state & layout
    ├── index.css                     # Tailwind CSS & custom control styling
    ├── main.tsx                      # React entry point
    ├── components
    │   ├── ControlDock.tsx           # Desktop dock & mobile thumb bar/drawer
    │   └── VideoExportModal.tsx      # Transition animation & Live Photo export modal
    ├── scene
    │   ├── QrTreeScene.ts            # Three.js scene orchestrator, camera & export loop
    │   ├── qrSampler.ts              # Client-side QR image sampling & 2D PNG export
    │   ├── treeGenerator.ts          # Species-specific procedural trunks, branches & bark
    │   ├── leafMorphSystem.ts        # 2048×1024 botanical atlas & GPU morph/falling shaders
    │   ├── meadowSystem.ts           # Procedural grass & ground system
    │   ├── weatherSystem.ts          # Sky dome, rain & snow particle systems
    │   ├── wildlifeSystem.ts         # Butterflies & birds animation
    │   └── audioEngine.ts            # Web Audio birdsong & rainfall synthesizer
    └── utils
        └── videoExportClient.ts      # Pure-frontend MP4 & Live Photo (JPG + MOV + ZIP) encoder
```

---

## Using Exported Live Photo Files

When exporting **实况压缩包 (`.ZIP`)**, the browser generates a paired `.JPG` cover image and `.MOV` clip:

- **iPhone / iPad**: Unzip the `.ZIP` in the **Files** app, select both the `.JPG` and `.MOV` files together, and tap **Share → Save 2 Items** (or use **System Share** directly from the export dialog) to save to Photos.
- **macOS**: Unzip the archive and drag both the `.JPG` and `.MOV` files together into the **Photos** app to import them as a Live Photo.
