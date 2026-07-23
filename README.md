# Depth Video Studio

将任意视频转为深度图形式的视频的本地桌面应用。

## Current status

The foundation milestone is complete: a local Electron desktop shell with secure file selection, an input-to-export workflow, quality settings, and a processing-state contract. The actual inference engine is intentionally the next milestone.

## Development

```powershell
npm install
npm run start
```

Run static JavaScript syntax checks with:

```powershell
npm run check
```

## Product principles

- Local-first: source videos stay on the user's computer.
- GPU-aware: future inference uses a local GPU when it is available and falls back to CPU.
- Distributable: users will not need Python, FFmpeg, or a CUDA Toolkit installation.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the process boundary and the planned inference milestone.
