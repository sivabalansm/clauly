# Clauly

> Live contract-review overlay. Captures everyone speaking in your meeting, transcribes it in real time, and on a single button-click runs Claude against the contract you uploaded — returning concrete redlines, what to say next, and risks raised by the other party.

Built to kill the "let's circle back over email" loop.

## What it does

1. **Load a contract once** — paste, or upload PDF / DOCX / TXT. It stays cached for the whole session.
2. **Pick the meeting window** — when you click Start capture in `system` mode, Clauly shows a source picker. Pick the Zoom (or Meet/Teams/whatever) window.
3. **System audio is captured natively** — Electron's `desktopCapturer` + `setDisplayMediaRequestHandler` + `audio: 'loopback'` grabs that window's audio via the OS API (ScreenCaptureKit on macOS 13+, WASAPI on Windows, PipeWire on Linux). No BlackHole, no virtual cables, no loopback dance.
4. **Whisper.cpp transcribes locally** — chunks of audio go through `nodejs-whisper` running entirely on your CPU. No API keys, no cloud, no quota. Default model is `base.en` (~141MB), tunable via `WHISPER_LOCAL_MODEL`.
5. **Hit Analyze** — Claude reads the contract (cached) + the live transcript, returns:
   - **Redlines** — verbatim contract quotes + suggested edits + severity
   - **What to say** — short conversational lines you can speak
   - **Risks** — concerns triggered by what the other party just said
   - **Quick replies** — copy-paste shorthand
5. **Repeat** every time the conversation moves to a new clause. Each click reuses the cached contract — only the transcript changes.

## Setup

```bash
# 1. Install
npm install

# 2. Configure keys
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY and OPENAI_API_KEY

# 3. Run
npm start
```

`npm start` boots Vite (port 5180) and Electron together. Window appears top-right, always-on-top, transparent dark theme.

## Configuration (`.env`)

| Variable | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | _(required)_ | https://console.anthropic.com — for Claude analysis only |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` | Override to any current Sonnet/Opus model |
| `WHISPER_LOCAL_MODEL` | `base.en` | `tiny.en` (fastest, ~75MB) / `base.en` / `small.en` / `medium.en` / `large-v3` (most accurate, ~3GB). Auto-downloaded on first run. |
| `ANALYSIS_TEMPERATURE` | `0.2` | Claude temperature for analysis |
| `OPENAI_API_KEY` | optional | Only needed if you swap to the OpenAI Whisper API fallback (electron/TranscriptionService.ts). |
| `OPENAI_TRANSCRIBE_MODEL` | `whisper-1` | Same — only matters if you use the OpenAI fallback. |

## Transcription backend

Clauly runs **whisper.cpp locally** via the [`nodejs-whisper`](https://www.npmjs.com/package/nodejs-whisper) package:
- **Free** — no API keys, runs on your CPU.
- **Private** — audio never leaves your machine.
- **Offline-capable** — once the model is downloaded, no internet required for transcription (Anthropic for analysis still does need internet).
- **Tunable accuracy** — `tiny.en` for speed, `large-v3` for quality.

The first run will auto-build `whisper.cpp` (needs `cmake`, `make`, `gcc`/`clang`) and download the chosen model into `<userData>/whisper-models`. On subsequent runs it boots instantly.

The OpenAI Whisper API is still wired in (under `electron/TranscriptionService.ts` + the `transcribe:chunk` IPC) and can be swapped in by changing one line in `src/App.tsx` if you ever want cloud transcription.

## Audio capture (the whole point)

Clauly uses Electron's modern **`setDisplayMediaRequestHandler` + `audio: 'loopback'`** API to grab system audio directly from the OS. When you click Start capture in `system` mode:

1. The renderer calls `navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })`.
2. Main process intercepts the request, asks `desktopCapturer.getSources()` for screens & windows, hands you a picker.
3. You click the Zoom (or any) window.
4. Main process returns `{ video: <chosen source>, audio: 'loopback' }` to the renderer.
5. Audio streams in. Video track is immediately discarded.

| Platform | What's used | What's needed |
|---|---|---|
| **macOS 13+** | `ScreenCaptureKit` | Grant Screen Recording permission when prompted |
| **Linux** | `xdg-desktop-portal-pipewire` | PipeWire 0.3+ |
| **Windows** | WASAPI loopback | Built-in |

No BlackHole. No VB-Cable. No Stereo Mix. Just the native OS API.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + Shift + A` | Run analysis now (the big button) |
| `Cmd/Ctrl + Shift + L` | Toggle capture (start/stop) |
| `Cmd/Ctrl + Shift + H` | Toggle window visibility |

## Architecture

```
┌─ Electron Main Process ─────────────────────────────────┐
│                                                         │
│  ContractStore       — PDF/DOCX/TXT → text + glossary   │
│  LocalWhisperService — whisper.cpp via nodejs-whisper   │
│  TranscriptionSvc    — OpenAI Whisper API (fallback)    │
│  AnalysisSvc         — Anthropic Claude w/ prompt cache │
│  WindowHelper        — always-on-top overlay            │
│  setDisplayMediaRequestHandler                          │
│      └─ desktopCapturer.getSources() for system audio   │
│  IPC handlers        — contextBridge'd to renderer      │
│                                                         │
└─────────────┬────────────────────────────┬──────────────┘
              │ IPC                        │
┌─ Renderer (React + Vite + Tailwind) ────┴──────────────┐
│                                                         │
│  useSystemAudioCapture — getUserMedia / getDisplayMedia │
│                          chunked via stop/restart       │
│                          MediaRecorder, ~6s blobs       │
│                                                         │
│  SourcePicker     — modal listing screens & windows     │
│                     with thumbnails (desktopCapturer)   │
│                                                         │
│  Onboarding → CaptureControls → SourcePicker →          │
│  TranscriptView → AnalyzeButton → AnalysisPanel         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Cost estimate

- **whisper.cpp (default)**: $0 — runs locally on your CPU. Trade-off is power usage and a small accuracy gap vs cloud Whisper for harder audio.
- **Claude Sonnet 4.5**: ~$3/M input tokens, $15/M output. With prompt-caching, the contract is charged once per ~5min refresh window. Each "Analyze" click adds the transcript (~hundreds to a few thousand tokens) + ~1k tokens out. Per-click cost ≈ $0.01–0.05 for typical contracts.
- **Whisper-1 cloud (optional fallback)**: $0.006/minute of audio if you swap to OpenAI's API. A 60-min meeting ≈ $0.36.

## Known limitations

- **Hallucination guard**: Claude is instructed to quote contract text verbatim, but verify any clause reference before signing. Trust the redlines, but read the originals.
- **Diarization**: Clauly does NOT identify who is speaking. The transcript is one continuous stream.
- **whisper.cpp accuracy**: With `base.en` you'll get ~95% accuracy on clean audio; jargon and proper nouns may garble. Bump to `small.en` or `medium.en` for negotiation-grade meetings.
- **CPU load**: real-time transcription with `base.en` runs ~10× faster than realtime on a recent Mac, so it stays comfortable. `large-v3` is closer to ~2× realtime — fine but warmer fans.
- **First-run delay**: the first chunk after launch may stall ~10s while the model loads into memory. Subsequent chunks are fast.
- **Transcript size**: very long meetings (~hours) will eventually slow analysis. Clear the transcript between major topics if needed.
- **macOS Screen Recording permission**: required, prompted by the OS when you first click "Start capture" in system mode. Until granted, `getDisplayMedia` returns no audio track.

## Build for distribution

```bash
npm run dist:mac    # .dmg for x64 + arm64
npm run dist:linux  # AppImage
npm run dist:win    # NSIS installer
```

Output lands in `release/`.

## License

Private project. No license granted.
