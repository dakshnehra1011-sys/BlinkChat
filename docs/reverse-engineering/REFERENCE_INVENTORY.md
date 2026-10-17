# Reference Inventory: WebCatalog Setup 81.5.0.exe

## 1. Artifact Identity

- **File Name**: `WebCatalog Setup 81.5.0.exe`
- **Location**: `C:\Users\Daksh Nehra\Downloads\WebCatalog Setup 81.5.0.exe`
- **Size**: 279,060,488 bytes (266 MiB)
- **Format**: Windows PE NSIS Installer (x64)
- **SHA-256**: `20e33fab4fdab9139dcef7e2202d5ee2720f8e1be5e060099b4c308bdce491c7`
- **Embedded Application Root**: `resources/app.asar` (39,881,216 bytes, SHA-256: `76157af493ab6a143f3535d0721e61a6c82ade28b6e20563ba7218dad16b7619`)
- **Publisher**: WebCatalog, Inc. / WebCatalog Ltd
- **Update Metadata Provider**: Generic CDN (`https://cdn-2.webcatalog.io/webcatalog`)

## 2. Extraction & Layout Inventory

Inspected via BSD `tar` and `rea-agents@6.5.0`:

- Root level files:
  - `WebCatalog.exe` (PE wrapper executable)
  - `ffmpeg.dll`, `d3dcompiler_47.dll`, `dxcompiler.dll`, `dxil.dll` (Chromium multimedia and rendering engines)
  - `resources/app.asar` (Electron packaged codebase)
  - `resources/app.asar.unpacked/` (Pre-forked scripts and native elevated execution binaries)
  - `resources/elevate.exe` (UAC privilege helper)
  - `resources/app-update.yml` (Electron-updater configuration)
  - `locales/*.pak` (Chromium localization packages)

## 3. Application Domain & Purpose

- WebCatalog is a desktop wrapper platform that manages web apps in sandboxed Electron window instances.
- Reconstructed JavaScript graph (523 sources parsed via `rea analyze-javascript-application`) reveals features:
  - Account sync & cloud backups
  - App catalog browsing, installation, and sandboxing
  - Custom user-agent management, proxy configuration, and workspace switching
- **Conclusion**: WebCatalog is completely unrelated to random peer-to-peer video chat (no WebRTC, no matchmaking queues, no signaling protocols). Per prompt Section 4.3, this reference is documented as unrelated and BlinkChat is implemented from its independent specification.
