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

## Bloom Console

Bloom now includes an in-app developer console overlay designed for power users.

- **UI wiring**: Mounted in `src/components/Layout.tsx` as `<BloomConsole />` so it shares the existing shell, theme variables, blur, motion, and overlay stack.
- **Component**: `src/components/BloomConsole.tsx` handles keyboard UX, history navigation, autocomplete, inline suggestions, and formatted output rendering.
- **Command runtime**:
  - Parser: `src/console/parser.ts`
  - Executor/validation: `src/console/executor.ts`
  - Registry (commands + metadata): `src/console/registry.ts`
  - Suggestions: `src/console/suggestions.ts`
  - Store/history: `src/console/store.ts`
- **Settings keys**: Shared in `src/constants/console.ts` (hotkey, history persistence, startup tip, dev-help visibility, log level).
- **Adding commands**: Add a typed command definition in `createConsoleRegistry()` inside `src/console/registry.ts` with `name`, `usage`, `description`, optional `args`, optional `autocomplete`, and a safe `handler` that uses the provided runtime context (no shell/eval access).

## Script Studio (BloomScript IDE)

Bloom now includes an IDE-style in-app scripting surface for power users.

- **Route/UI**: `src/pages/ScriptStudio.tsx` mounted at `/script-studio` and wired into sidebar/search.
- **Language tooling** (`src/ide/`):
  - `types.ts`: typed AST/execution shapes
  - `bridge.ts`: maps dot-style BloomScript commands to console command definitions/aliases
  - `parser.ts`: tokenizer/parser + static diagnostics
  - `runtime.ts`: safe executor that routes commands through Bloom's internal command runtime (no OS shell, no eval)
  - `language.ts`: Monaco language registration, custom syntax theme, completion provider, and marker mapping
- **How command execution works**:
  1. BloomScript parses statements (`let`, commands, variables like `$name`)
  2. Command names resolve against the existing Bloom console registry
  3. Execution is forwarded through `executeConsoleInput(...)` with typed context handlers
- **Adding future language commands**: add/update console commands in `src/console/registry.ts`; BloomScript command index and autocomplete will pick them up automatically through the bridge layer.

## Host Server (Local + Relay-Ready)

Bloom now includes a built-in local server hosting surface with a compact control panel.

- **Route/UI**: `src/pages/HostServer.tsx` mounted at `/host-server`, linked in sidebar + search.
- **State/provider**: `src/hooks/useHostedServers.ts` wraps server CRUD/lifecycle actions.
- **Tauri bridge**: `src/services/tauri.ts` exposes hosted-server commands and typed payloads.
- **Backend module**: `src-tauri/src/servers.rs` handles:
  - local server records and folders under app data `servers/`
  - vanilla server jar provisioning from Mojang metadata
  - process lifecycle (`start`, `stop`, `restart`, status polling)
  - live log capture + command stdin forwarding
  - file browser actions (list/read/write/create/rename/delete)
  - backup actions (create/list/delete/restore)
  - tunnel session wiring points (`hosted_servers_tunnel_open/close`)

### Hidden IP model

- Server process always runs on host machine locally (for example `127.0.0.1:<port>`).
- Public shareable address uses Bloom hostname metadata (`<subdomain>.playbloom.gg`).
- The client is wired for outbound relay negotiation via environment variables:
  - `BLOOM_RELAY_API_URL` (optional API handshake endpoint)
  - `BLOOM_RELAY_API_KEY` (optional bearer token)
  - `BLOOM_RELAY_ENDPOINT` (optional informational relay endpoint string)
- Without relay API configuration, tunnel commands remain safe placeholders (no raw home-IP exposure flow is added in renderer).
