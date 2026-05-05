# vek-sync

> One config file. Every editor. Always in sync.

<img width="1034" height="486" alt="Screenshot 2026-05-06 091247" src="https://github.com/user-attachments/assets/386b513d-c75f-49ae-99a3-bf1a0d0adde5" />
<img width="1089" height="442" alt="Screenshot 2026-05-06 091216" src="https://github.com/user-attachments/assets/fd118a2a-c077-45e0-801c-7b46b2496572" />
<img width="1070" height="460" alt="Screenshot 2026-05-06 091233" src="https://github.com/user-attachments/assets/13192cdd-f922-45e8-8a5d-00cbd2300978" />

`vek-sync` is a zero-dependency CLI that keeps your MCP (Model Context Protocol) server configurations in sync across every AI editor — Claude Desktop, Cursor, VS Code, Windsurf, Claude Code, Cline, Roo Code, Gemini CLI, GitHub Copilot, Continue, and Codex. No account. No cloud. Just a single `.mcp.json` file and one command.

Define your servers once. Push to every editor. Pull from any editor to bootstrap. Ping servers to verify they're alive. Share configs via URL. Store secrets safely in an encrypted local vault.

## Install

```bash
npm install -g @vektormemory/vek-sync
```

## Quick start

```bash
# Bootstrap from an existing editor
vek-sync init --from cursor

# Preview what sync will change
vek-sync sync --dry-run

# Push to all editors
vek-sync sync

# Verify servers are actually running
vek-sync ping
```

## The .mcp.json file

Commit this to your repo (secrets use vault refs, never plaintext):

```json
{
  "mcpSync": {
    "version": "1.0",
    "description": "My MCP servers"
  },
  "servers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/server.mjs", "mcp"],
      "env": {
        "API_KEY": "vault:my-api-key"
      }
    },
    "my-sse-server": {
      "url": "https://my-server.example.com/sse",
      "headers": {
        "Authorization": "vault:my-auth-token"
      }
    }
  }
}
```

## Commands

### `vek-sync init`

Create a fresh `.mcp.json` in the current directory. Use `--from` to bootstrap from an installed editor, or `--from-url` to pull a shared config.

```bash
vek-sync init
vek-sync init --description "My project MCP servers"
vek-sync init --from cursor
vek-sync init --from-url https://paste.rs/abc123
```

### `vek-sync sync`

Push `.mcp.json` → all installed editors. Safe — never wipes existing non-MCP config keys. Backs up each editor config before writing. Use `--dry-run` to preview changes without touching anything.

```bash
vek-sync sync
vek-sync sync --dry-run
vek-sync sync --only claudeDesktop,cursor
vek-sync sync --watch                        # re-sync on .mcp.json change
```

### `vek-sync add`

Interactive wizard to add a new MCP server to `.mcp.json`. Searches the curated registry and npm, lets you pick, fills in env keys, stores secrets in the vault.

```bash
vek-sync add
vek-sync add github
```

### `vek-sync ping`

Spawn each configured server and verify it responds to an MCP initialize handshake. HTTP servers are checked with a GET request.

```bash
vek-sync ping
vek-sync ping --only my-server
```

### `vek-sync search`

Search the curated registry and npm for MCP servers by keyword.

```bash
vek-sync search postgres
vek-sync search slack
```

### `vek-sync share`

Upload your `.mcp.json` to [paste.rs](https://paste.rs) and get a shareable URL. Secrets are stripped before upload.

```bash
vek-sync share
```

### `vek-sync profile`

Manage named profiles inside `.mcp.json`. Switch between different sets of servers for different projects or environments.

```bash
vek-sync profile list
vek-sync profile use work
vek-sync profile save personal
```

### `vek-sync export`

Pull MCP servers from all installed editors → `.mcp.json`. Merges, never overwrites.

```bash
vek-sync export
vek-sync export --only windsurf
```

### `vek-sync status`

Show which editors are installed and how many servers each has.

```bash
vek-sync status
```

### `vek-sync diff`

Show drift between `.mcp.json` and what's actually in each editor. Exits non-zero if drift detected — useful in CI.

```bash
vek-sync diff
```

### `vek-sync vault`

Store secrets encrypted on disk, machine-bound with AES-256-GCM. Reference them in `.mcp.json` as `vault:key-name`.

> **No account required.** The vault is local-only — secrets are encrypted on your machine and never leave it.

```bash
vek-sync vault set my-api-key sk-abc123
vek-sync vault get my-api-key
vek-sync vault list
vek-sync vault delete my-api-key
```

Vault files live in `~/.vek-sync/` with permissions set to `600`. The encryption key is derived from your machine identity — secrets encrypted on one machine cannot be read on another.

## Supported editors

| Editor | Config location | Notes |
|---|---|---|
| Claude Desktop | `%APPDATA%/Claude/claude_desktop_config.json` | Windows / macOS / Linux |
| Cursor | `~/.cursor/mcp.json` | Global scope |
| VS Code | `.vscode/mcp.json` | Workspace-scoped |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | — |
| Claude Code | `~/.claude/claude_desktop_config.json` | Same format as Claude Desktop |
| Cline | `%APPDATA%/Code/User/globalStorage/saoudrizwan.claude-dev/…` | VS Code extension |
| Roo Code | `%APPDATA%/Code/User/globalStorage/rooveterinaryinc.roo-cline/…` | VS Code extension |
| Gemini CLI | `~/.gemini/settings.json` | — |
| GitHub Copilot | `~/.copilot/mcp-config.json` | — |
| Continue | `~/.continue/config.json` | Array format, auto-converted |
| Codex | `~/.codex/config.toml` | TOML format, auto-converted |

## Options

| Flag | Description |
|---|---|
| `--file <path>` | Path to `.mcp.json` (default: walks up from cwd) |
| `--only <name,...>` | Limit command to specific connector(s) |
| `--dry-run` | Preview changes without writing anything |
| `--watch` | Re-sync automatically when `.mcp.json` changes |
| `--from <editor>` | Bootstrap `init` from an installed editor |
| `--from-url <url>` | Bootstrap `init` from a shared paste URL |
| `--description <text>` | Description text for `init` |

Connector names: `claudeDesktop`, `cursor`, `vscode`, `windsurf`, `claudeCode`, `cline`, `rooCode`, `gemini`, `copilot`, `continue_`, `codex`

## Design

- **Zero dependencies** — pure Node.js ESM, no npm install step, no native addons
- **Secrets never in plaintext** — `vault:key-name` refs resolved at runtime, never written to editor configs as raw values
- **Backup before write** — every sync backs up the target config to `~/.vek-sync/backups/<timestamp>/` first
- **Non-destructive writes** — `sync` merges into existing editor configs, preserving all non-MCP keys
- **Standalone connectors** — each connector is self-contained with no shared runtime state
- **CI-friendly** — `diff` exits non-zero on drift; `--dry-run` lets you validate without side effects

## License

Apache-2.0
