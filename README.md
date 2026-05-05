\# Mcp-sync



> One config file. Every editor. Always in sync.



`mcp-sync` is a CLI tool that keeps your MCP (Model Context Protocol) server configurations in sync across all your AI editors — Claude Desktop, Cursor, VS Code, Windsurf, and Claude Code.



Define your servers once in `.mcp.json`. Push to every editor with one command. Pull from any editor to bootstrap the file. Store secrets safely in an encrypted local vault.



\## Install



```bash

npm install -g @vektormemory/mcp-sync

```



\## Quick start



```bash

\# 1. Pull your existing configs into a .mcp.json

mcp-sync export



\# 2. Check what's in sync

mcp-sync diff



\# 3. Push .mcp.json to all editors

mcp-sync sync

```



\## The .mcp.json file



Commit this to your repo (secrets use vault refs, never plaintext):



```json

{

&#x20; "mcpSync": {

&#x20;   "version": "1.0",

&#x20;   "description": "My MCP servers"

&#x20; },

&#x20; "servers": {

&#x20;   "my-server": {

&#x20;     "command": "node",

&#x20;     "args": \["/path/to/server.mjs", "mcp"],

&#x20;     "env": {

&#x20;       "API\_KEY": "vault:my-api-key"

&#x20;     }

&#x20;   },

&#x20;   "my-sse-server": {

&#x20;     "url": "https://my-server.example.com/sse",

&#x20;     "headers": {

&#x20;       "Authorization": "vault:my-auth-token"

&#x20;     }

&#x20;   }

&#x20; }

}

```



\## Commands



\### `mcp-sync init`

Create a fresh `.mcp.json` in the current directory.



```bash

mcp-sync init

mcp-sync init --description "My project MCP servers"

```



\### `mcp-sync sync`

Push `.mcp.json` → all installed editors. Safe — never wipes existing non-MCP config keys.



```bash

mcp-sync sync

mcp-sync sync --only claudeDesktop,cursor   # specific editors only

```



\### `mcp-sync export`

Pull MCP servers from all installed editors → `.mcp.json`. Merges, never overwrites.



```bash

mcp-sync export

mcp-sync export --only windsurf

```



\### `mcp-sync status`

Show which editors are installed and how many servers each has.



```bash

mcp-sync status

```



\### `mcp-sync diff`

Show drift between `.mcp.json` and what's actually in each editor. Exits non-zero if drift detected — useful in CI.



```bash

mcp-sync diff

```



\### `mcp-sync vault`

Store secrets encrypted on disk, machine-bound with AES-256-GCM. Reference them in `.mcp.json` as `vault:key-name`.



```bash

mcp-sync vault set my-api-key sk-abc123

mcp-sync vault get my-api-key

mcp-sync vault list

mcp-sync vault delete my-api-key

```



\## Supported editors



| Editor | Config location | Notes |

|---|---|---|

| Claude Desktop | `%APPDATA%/Claude/claude\_desktop\_config.json` | Windows / macOS / Linux |

| Cursor | `\~/.cursor/mcp.json` | Global scope |

| VS Code | `.vscode/mcp.json` | Workspace-scoped |

| Windsurf | `\~/.codeium/windsurf/mcp\_config.json` | Uses `serverUrl` internally |

| Claude Code | `\~/.claude/claude\_desktop\_config.json` | Same format as Claude Desktop |



\## Options



| Flag | Description |

|---|---|

| `--file <path>` | Path to `.mcp.json` (default: walks up from cwd) |

| `--only <name,...>` | Limit command to specific connector(s) |

| `--description <text>` | Description text for `init` |



Connector names: `claudeDesktop`, `cursor`, `vscode`, `windsurf`, `claudeCode`



\## Design



\- \*\*Secrets never in plaintext\*\* — `vault:key-name` refs are resolved at runtime, never written to editor configs as raw values

\- \*\*Non-destructive writes\*\* — `sync` merges into existing editor configs, preserving all non-MCP keys (preferences, project settings, etc.)

\- \*\*Standalone connectors\*\* — each connector is self-contained with no shared runtime dependencies

\- \*\*CI-friendly\*\* — `diff` exits non-zero on drift, making it easy to detect config skew in pipelines



\## License



MIT

