\# vek-sync Portable Format Specification

\# .mcp.json v1.0.0



> The open interchange format for MCP server configurations across AI clients.



\## Overview



`.mcp.json` is a single source-of-truth config file that lives at `\~/.mcp.json`.

It defines MCP servers once and lets `vek-sync` write the correct client-specific

config to every supported AI tool — with credentials stored by reference, never

in plaintext.



\---



\## File Location



| Scope   | Path              |

|---------|-------------------|

| Global  | `\~/.mcp.json`     |

| Project | `./.mcp.json`     |



Project-level overrides global. Same precedence model as `.cursor/mcp.json`.



\---



\## Top-Level Structure



```json

{

&#x20; "version": "1.0",

&#x20; "vault": "local",

&#x20; "servers": { ... },

&#x20; "meta": { ... }

}

```



| Field     | Type   | Required | Description                                      |

|-----------|--------|----------|--------------------------------------------------|

| `version` | string | yes      | Spec version. Currently `"1.0"`                  |

| `vault`   | string | no       | Credential backend. Default: `"local"`           |

| `servers` | object | yes      | Map of server name → server definition           |

| `meta`    | object | no       | Sync metadata — written by vek-sync, not by hand |



\---



\## Server Definition



```json

{

&#x20; "servers": {

&#x20;   "github": {

&#x20;     "transport": "stdio",

&#x20;     "command": "npx",

&#x20;     "args": \["-y", "@modelcontextprotocol/server-github"],

&#x20;     "env": {

&#x20;       "GITHUB\_TOKEN": "vault:github-token"

&#x20;     },

&#x20;     "clients": \["claude-desktop", "cursor", "vscode"]

&#x20;   },

&#x20;   "stripe": {

&#x20;     "transport": "http",

&#x20;     "url": "https://mcp.stripe.com/v1",

&#x20;     "headers": {

&#x20;       "Authorization": "vault:stripe-bearer"

&#x20;     },

&#x20;     "clients": \["claude-desktop", "cursor"]

&#x20;   }

&#x20; }

}

```



\### Fields



| Field       | Type     | Required | Description                                           |

|-------------|----------|----------|-------------------------------------------------------|

| `transport` | string   | yes      | `"stdio"` or `"http"`                                 |

| `command`   | string   | stdio    | Executable — `npx`, `node`, `python`, `uvx` etc      |

| `args`      | array    | stdio    | CLI arguments array                                   |

| `env`       | object   | no       | Environment variables — values may be vault refs      |

| `url`       | string   | http     | Remote MCP endpoint URL                               |

| `headers`   | object   | no       | HTTP headers — values may be vault refs               |

| `clients`   | array    | yes      | Which clients to sync this server to                  |

| `disabled`  | boolean  | no       | If true, excluded from all syncs. Default: false      |

| `note`      | string   | no       | Human comment — ignored by vek-sync                   |



\---



\## Credential References



Credentials are \*\*never stored in plaintext\*\* in `.mcp.json`.

Values prefixed with `vault:` are resolved at sync time from the credential vault.



```json

"env": {

&#x20; "GITHUB\_TOKEN": "vault:github-token",

&#x20; "API\_KEY":      "vault:my-api-key"

}

```



\### Vault Backends



| Backend   | Description                              | Status    |

|-----------|------------------------------------------|-----------|

| `local`   | AES-256 encrypted file `\~/.mcp-vault`   | v0.1 ✅   |

| `env`     | Reads from shell environment variables   | v0.2      |

| `1password` | 1Password CLI (`op`)                   | v0.3      |

| `keychain` | macOS Keychain / Windows Credential Manager | v0.3  |



Vault CLI:

```bash

vek-sync vault set github-token ghp\_xxxx   # store

vek-sync vault get github-token            # retrieve

vek-sync vault list                         # list all keys

vek-sync vault delete github-token         # remove

```



\---



\## Supported Clients



| Client ID        | Config File                                              | Root Key          |

|------------------|----------------------------------------------------------|-------------------|

| `claude-desktop` | `%AppData%/Claude/claude\_desktop\_config.json` (Win)     | `mcpServers`      |

|                  | `\~/Library/Application Support/Claude/...` (Mac)        | `mcpServers`      |

| `cursor`         | `\~/.cursor/mcp.json`                                     | `mcpServers`      |

| `cursor-project` | `.cursor/mcp.json`                                       | `mcpServers`      |

| `vscode`         | `.vscode/mcp.json`                                       | `servers`         |

| `windsurf`       | `\~/.codeium/windsurf/mcp\_config.json`                   | `mcpServers`      |

| `claude-code`    | `\~/.claude/claude\_desktop\_config.json`                   | `mcpServers`      |

| `cline`          | VS Code `settings.json` → `cline.mcpServers`            | `mcpServers`      |

| `zed`            | `\~/.config/zed/settings.json` → `context\_servers`       | `context\_servers` |



\---



\## Meta Block (written by vek-sync)



```json

"meta": {

&#x20; "last\_synced": "2026-05-05T10:00:00.000Z",

&#x20; "synced\_clients": \["claude-desktop", "cursor", "vscode"],

&#x20; "mcp\_sync\_version": "0.1.0"

}

```



Do not edit this block manually — vek-sync owns it.



\---



\## CLI Reference



```bash

\# Export existing client config → .mcp.json

vek-sync export --from claude-desktop



\# Write .mcp.json → single client

vek-sync import --to cursor



\# Sync to all declared clients at once

vek-sync sync



\# Sync to specific clients only

vek-sync sync --clients claude-desktop,cursor,vscode



\# Show current state — which servers are in which clients

vek-sync status



\# Show diff — what would change without writing

vek-sync diff --client vscode



\# Validate .mcp.json against spec

vek-sync validate

```



\---



\## Example — Full .mcp.json



```json

{

&#x20; "version": "1.0",

&#x20; "vault": "local",

&#x20; "servers": {

&#x20;   "github": {

&#x20;     "transport": "stdio",

&#x20;     "command": "npx",

&#x20;     "args": \["-y", "@modelcontextprotocol/server-github"],

&#x20;     "env": {

&#x20;       "GITHUB\_TOKEN": "vault:github-token"

&#x20;     },

&#x20;     "clients": \["claude-desktop", "cursor", "vscode", "windsurf"]

&#x20;   },

&#x20;   "filesystem": {

&#x20;     "transport": "stdio",

&#x20;     "command": "npx",

&#x20;     "args": \["-y", "@modelcontextprotocol/server-filesystem", "/home/user"],

&#x20;     "clients": \["claude-desktop", "claude-code"]

&#x20;   },

&#x20;   "stripe": {

&#x20;     "transport": "http",

&#x20;     "url": "https://mcp.stripe.com/v1",

&#x20;     "headers": {

&#x20;       "Authorization": "vault:stripe-bearer"

&#x20;     },

&#x20;     "clients": \["claude-desktop"]

&#x20;   }

&#x20; },

&#x20; "meta": {

&#x20;   "last\_synced": "2026-05-05T10:00:00.000Z",

&#x20;   "synced\_clients": \["claude-desktop", "cursor", "vscode"],

&#x20;   "mcp\_sync\_version": "0.1.0"

&#x20; }

}

```



\---



\## Versioning



This spec follows semver. Breaking changes bump the major version.

The `version` field in `.mcp.json` must match the major version of the

installed `vek-sync` CLI.



\---



Built by \[VEKTOR](https://vektormemory.com)

