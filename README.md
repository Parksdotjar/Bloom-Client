# Bloom Client

A premium, modern desktop Minecraft launcher built with Tauri v2, React, TypeScript, and Tailwind CSS.
Features a League of Legends inspired client aesthetic.

## Architecture & Tech Stack

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Tauri v2 (Rust)
- **Data Storage**: Local JSON files securely stored in the OS AppData directory.

## Current Progress

- **Phase 1 (Complete)**: UI Shell, React Router Layout, Custom Window configuration, Instances Rust Backend (CRUD logic storing `instance.json`), and Download Simulator.
- **Phase 2 (Complete)**: Microsoft Device Code OAuth flow, XBL/XSTS token exchange, and Minecraft identity fetching.

## Build/Run Instructions

### Prerequisites
- NodeJS (v18+)
- Rust (via `rustup`)
- **Windows**: WebView2
- **macOS**: Xcode CLI tools (`xcode-select --install`)

### Local Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the Tauri dev server (hot-reload for both React and Rust):
   ```bash
   npm run tauri dev
   ```

### Building for Production
To produce standard standalone installer executables (.exe, .dmg, .app):
```bash
npm run tauri build
```
Binaries will be output to `src-tauri/target/release/bundle`.

## Auto-Updates (No New EXE Sharing)

Bloom Client is now wired for Tauri updater releases.

### One-time setup
1. Generate updater keys locally:
   ```bash
   npm run tauri signer generate -- --write-keys .tauri/updater.key --ci
   ```
2. Keep `.tauri/updater.key` secret. Do not commit it.
3. Add GitHub repo secrets:
   - `TAURI_SIGNING_PRIVATE_KEY` = full contents of `.tauri/updater.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = key password (leave empty if none)

### Ship an update
1. Bump versions:
   - `package.json` version
   - `src-tauri/tauri.conf.json` version
2. Commit and push.
3. Create and push a tag matching the version:
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```
4. GitHub Actions workflow `.github/workflows/release.yml` builds, signs, and publishes installers plus updater metadata.
5. Existing users can update from inside the app via Settings -> Extra -> App Updates.

## Next Steps (Phases 3-5)
- **Vanilla Launch Logic**: Fetch Mojang manifests, download libraries, extract natives, build the JVM launch command.
- **Fabric Launch Logic**: Fetch Fabric metadata, install loaders, inject Mixins.
- **Polish**: Crash log catchers, auto-updaters, and user settings panel wiring.
