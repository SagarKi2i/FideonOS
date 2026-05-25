# Fideon OS — Cinematic Trailer (Remotion)

A 4-minute 20-second product demo video built with [Remotion](https://www.remotion.dev/).

## Scenes (12 total, ~260 seconds)

| # | Scene | Duration | File |
|---|-------|----------|------|
| 1 | Title / Brand Intro | 20s | `Scene1_ColdOpen.tsx` |
| 2 | The Problem (Stats) | 25s | `Scene2_Stats.tsx` |
| 3 | Fideon Reveal | 25s | `Scene3_Reveal.tsx` |
| 4 | AI Marketplace | 25s | `Scene4_Marketplace.tsx` |
| 5 | Document Intelligence | 30s | `Scene5_DocumentAI.tsx` |
| 6 | Policy Comparison | 25s | `Scene05_PolicyCompare.tsx` |
| 7 | Quote Generation | 25s | `Scene6_Quotes.tsx` |
| 8 | Agent Workflows | 25s | `Scene7_Workflows.tsx` |
| 9 | Claims / Review Queue | 30s | `Scene8_ReviewQueue.tsx` |
| 10 | Dashboard & Analytics | 20s | `Scene09_Dashboard.tsx` |
| 11 | Enterprise Security | 20s | `Scene10_Security.tsx` |
| 12 | Closing / CTA | 15s | `Scene9_Closing.tsx` |

## Local Rendering

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- Chrome/Chromium installed

### Steps

```bash
# 1. Install dependencies
cd remotion
bun install

# 2. Preview in Remotion Studio (optional — for visual editing)
bunx remotion studio src/index.ts

# 3. Render full video (~4:20)
bunx remotion render src/index.ts main output/Fideon_Trailer.mp4 \
  --codec=h264 \
  --crf=18 \
  --concurrency=4

# 4. Render a single scene for testing (e.g. Scene 6 starts at frame 3750)
bunx remotion render src/index.ts main output/scene6_test.mp4 \
  --frames=3750-4500

# 5. Check a single frame
bunx remotion still src/index.ts main output/frame-check.png --frame=3750
```

### Adding Audio

The sandbox render uses `muted: true`. For local renders, remove `--muted` and add audio:

```tsx
// In MainVideo.tsx, add:
import { Audio, staticFile } from "remotion";

// Inside the component, before <Series>:
<Audio src={staticFile("audio/background-music.mp3")} volume={0.3} />
```

Place your audio file in `remotion/public/audio/`.

### Tips

- **Concurrency**: Use `--concurrency=4` or higher for faster renders on multi-core machines
- **Quality**: Lower `--crf` = higher quality (18 is high quality, 23 is default)
- **Codec**: Use `--codec=h264` for MP4, `--codec=prores` for ProRes (editing)
- **Frame rate**: Currently 30fps. Change in `Root.tsx` if needed
