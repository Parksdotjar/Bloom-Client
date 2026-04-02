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

## Animated Cape Studio (Paid GIF/MP4 -> Runtime Atlas)

This repo now includes a full Animated Cape Studio flow:

- SQL + RLS + RPCs: `supabase/migrations/20260331193000_animated_cape_studio.sql`
- Edge orchestration routes: `supabase/functions/main/index.ts`
- Studio UI: `src/pages/AnimatedCapeStudio.tsx`
- Runtime preview player: `src/services/animatedCapeRuntime.ts`
- Worker (ffmpeg/ffprobe/sharp): `workers/animated-cape/`
- Detailed contracts/setup: `docs/animated-cape-studio.md`

### Local dev quick start
1. Copy `.env.example` and fill Supabase keys.
2. Apply migration in Supabase.
3. Deploy/update the `main` edge function.
4. Set `ANIMATED_CAPE_WORKER_SECRET` in edge function env.
5. Run worker:
   ```bash
   cd workers/animated-cape
   npm install
   npm run dev
   ```
6. Run client:
   ```bash
   npm run dev
   ```
7. Open route: `/animated-cape-studio`.

### Animated Worker Deployment (Coolify)
Create a separate service from this repo using base directory:

`workers/animated-cape`

Required env vars:

- `SUPABASE_URL` (example: `https://sb.bloomclient.org`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `BLOOM_MAIN_EDGE_URL` (example: `https://sb.bloomclient.org/functions/v1/main`)
- `ANIMATED_CAPE_WORKER_SECRET` (must exactly match edge function env)
- `POLL_INTERVAL_MS` (optional, default `2500`)
- `CLAIM_LEASE_SECONDS` (optional, default `300`)

Start command:

`npm start`

### How animated cape processing works end to end
1. User uploads GIF/MP4 in Animated Cape Studio.
2. Client requests signed upload ticket from edge route.
3. Source media uploads to private bucket path scoped to user.
4. Client registers upload metadata and submits paid order request.
5. Server RPC validates FPS/duration tier and computes authoritative price.
6. Server atomically debits wallet and writes ledger + order + queued job.
7. Worker claims job, runs ffprobe/ffmpeg pipeline, packs atlas pages, generates manifest + thumbnail/preview.
8. Worker uploads processed outputs and completes order through worker-only edge route.
9. Completion writes cosmetic ownership/equip state and animation asset metadata.
10. Client receives realtime updates, previews the processed animation, and can equip.

### How Bloom Bucks charging/refunds stay atomic
- Charging is performed inside a single server-side SQL transaction (`commerce_create_animated_cape_order`).
- Wallet row is locked before debit to prevent race/double-spend.
- Client price is ignored; server resolves tier price from `commerce_animated_cape_tiers`.
- Ledger entries are written for each debit/refund with idempotency keys.
- Worker failure path can call refund RPC (`commerce_refund_animated_cape_order`) to credit wallet and append a refund ledger entry atomically.

### How to plug this into the Bloom in-game cosmetics renderer
- Read equipped runtime data from `v_commerce_equipped_cape_runtime`.
- For animated capes, fetch `manifest_storage_path` and preload `atlas_pages`.
- Step frames using `durationMs` from manifest and choose `{page,x,y,w,h}` per tick.
- Bind atlas textures once and reuse (no GIF decode in game, no per-frame network fetch).
- Invalidate local cache when equipped cape or runtime asset changes.

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
