# Architecture

## First product slice

The application is a local-first Windows desktop product. The initial milestone provides the user interface, secure native file selection, and the contract for the future conversion pipeline. It deliberately does not ship a depth model or promise conversion yet.

## Process boundary

```text
Renderer (HTML/CSS/JS)
  -> narrow contextBridge API
Preload (no business logic)
  -> named IPC handlers
Main process
  -> native file dialogs / future job controller
Worker process (future)
  -> FFmpeg + ONNX Runtime + depth model
```

The renderer has no Node.js access. New native capabilities must be explicitly added to `src/preload.js` and validated in `src/main.js`.

## Next milestone

1. Add a packaged Python or Node worker that probes video metadata through FFmpeg.
2. Download and verify an ONNX depth model on first use.
3. Run frame batches through ONNX Runtime GPU when available and CPU otherwise.
4. Apply temporal stabilization and encode a depth MP4 with the original audio track.
5. Add task cancellation, recoverable job state, packaging, and a signed Windows installer.
