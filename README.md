# Bloom Client

Bloom Client is a desktop Minecraft launcher built with Tauri v2, React, TypeScript, and Tailwind CSS.

## Stack

- **Frontend**: React, Vite, Tailwind CSS
- **Desktop shell**: Tauri v2
- **Local data**: JSON-backed app data managed by the Tauri backend
- **Remote services**: Supabase-backed commerce, updates, and relay endpoints

## Development

### Prerequisites

- Node.js 18 or newer
- Rust via `rustup`
- Windows: WebView2
- macOS: Xcode command line tools (`xcode-select --install`)

### Install

```bash
npm install
```

### Run Locally

```bash
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

Tauri build artifacts are written under `src-tauri/target/release/bundle`.

## Auto-Updates

Bloom uses the Tauri updater release flow.

### Signing Setup

Generate updater keys locally:

```bash
npm run tauri signer generate -- --write-keys .tauri/updater.key --ci
```

Keep `.tauri/updater.key` out of source control. Configure these GitHub repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: full contents of `.tauri/updater.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: key password, or an empty value when no password is used

### Release Flow

1. Bump the version in `package.json`.
2. Bump the version in `src-tauri/tauri.conf.json`.
3. Commit and push the version change.
4. Create and push a matching version tag:

   ```bash
   git tag v1.5.7
   git push origin v1.5.7
   ```

5. `.github/workflows/release.yml` builds, signs, and publishes installers plus updater metadata.
6. Users update from Settings -> Extra -> App Updates.

## Bloom Console

Bloom includes an in-app console overlay for launcher commands and diagnostics.

- **Mount point**: `src/components/Layout.tsx`
- **UI component**: `src/components/BloomConsole.tsx`
- **Parser**: `src/console/parser.ts`
- **Executor and validation**: `src/console/executor.ts`
- **Command registry**: `src/console/registry.ts`
- **Suggestions**: `src/console/suggestions.ts`
- **History/store**: `src/console/store.ts`
- **Settings keys**: `src/constants/console.ts`

Add commands in `createConsoleRegistry()` with a typed command definition: `name`, `usage`, `description`, optional `args`, optional `autocomplete`, and a handler that uses the provided runtime context. Console commands do not expose shell or eval access.

## Script Studio

Script Studio provides a BloomScript editor and runtime on the `/script-studio` route.

- `src/pages/ScriptStudio.tsx`: route UI
- `src/ide/types.ts`: AST and execution types
- `src/ide/bridge.ts`: command mapping from BloomScript to console definitions
- `src/ide/parser.ts`: tokenizer, parser, and static diagnostics
- `src/ide/runtime.ts`: executor that routes commands through the console runtime
- `src/ide/language.ts`: Monaco registration, syntax theme, completions, and marker mapping

BloomScript parses statements, resolves command names against the console registry, and forwards execution through `executeConsoleInput(...)` with typed runtime handlers. New language commands should be added through the console registry so the bridge and autocomplete stay in sync.

## Host Server

Bloom includes local server hosting tools with relay integration points.

- **Route/UI**: `src/pages/HostServer.tsx`
- **State provider**: `src/hooks/useHostedServers.ts`
- **Tauri bridge**: `src/services/tauri.ts`
- **Backend module**: `src-tauri/src/servers.rs`

The backend manages server records, local server folders, vanilla server jar provisioning, process lifecycle actions, live logs, command input, file browser actions, backups, and tunnel session commands.

### Hidden IP Model

- Server processes run locally on the host machine.
- Public addresses use Bloom hostname metadata, such as `<subdomain>.playbloom.gg`.
- Relay negotiation is configured with:
  - `BLOOM_RELAY_API_URL`
  - `BLOOM_RELAY_API_KEY`
  - `BLOOM_RELAY_ENDPOINT`
- Without relay API configuration, tunnel commands do not expose the user's home IP from the renderer.

## CurseForge Relay

Bloom supports CurseForge access through a relay endpoint for distributed desktop builds.

- Local development can use `CURSEFORGE_API_KEY` directly.
- Desktop builds otherwise use the relay endpoint:
  - `${BLOOM_SUPABASE_URL}/functions/v1/main/curseforge`
- Override the relay URL with `BLOOM_CURSEFORGE_RELAY_URL`.

### Production Setup

1. Deploy the Supabase edge function in `supabase/functions/main`.
2. Set `CURSEFORGE_API_KEY=<your official CurseForge API key>` on the edge function.
3. Optionally set `BLOOM_RELAY_SHARED_KEY=<shared secret>` on the edge function and desktop runtime.

### Relay Endpoints

- `GET /curseforge/categories`
- `GET /curseforge/mods/search`
- `GET /curseforge/mods/:id`
- `GET /curseforge/mods/:id/files`

The relay keeps the CurseForge key on controlled infrastructure instead of embedding it in shipped Tauri binaries.
