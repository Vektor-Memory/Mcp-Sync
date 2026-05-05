/**
 * connectors/vscode.js
 *
 * Reads and writes VS Code MCP config.
 *
 * Config file locations:
 *   Workspace : .vscode/mcp.json        (project-level, committed to git)
 *   User      : resolved via VS Code CLI (rarely needed)
 *
 * ROOT KEY DIFFERENCE: VS Code uses "servers" not "mcpServers".
 * This is the #1 cause of broken configs when copying from Claude Desktop.
 *
 * HTTP transport field: "url" with optional "headers".
 * Type field required for http: { "type": "http", "url": "..." }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve }                                       from 'path';
import { homedir }                                             from 'os';

// ── Config path resolution ────────────────────────────────────────────────────

function getWorkspaceConfigPath() {
  return resolve(process.cwd(), '.vscode', 'mcp.json');
}

function getUserConfigPath() {
  // VS Code user-level mcp.json — opened via Command Palette
  // Path varies by platform but rarely edited directly
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || '', 'Code', 'User', 'mcp.json');
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'mcp.json');
  }
  return join(homedir(), '.config', 'Code', 'User', 'mcp.json');
}

function getConfigPath(scope = 'workspace') {
  return scope === 'user' ? getUserConfigPath() : getWorkspaceConfigPath();
}

// ── Read / Write ──────────────────────────────────────────────────────────────

function read(scope = 'workspace') {
  const path = getConfigPath(scope);
  if (!existsSync(path)) return { servers: {} };
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`[vscode] failed to parse config at ${path}: ${e.message}`);
  }
}

function write(config, scope = 'workspace') {
  const path = getConfigPath(scope);
  const dir  = join(path, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf8');
}

// ── Format conversion ─────────────────────────────────────────────────────────

/**
 * .mcp.json servers → VS Code "servers" format.
 *
 * Key differences from Claude Desktop / Cursor:
 *  - Root key is "servers" not "mcpServers"
 *  - HTTP entries require { "type": "http", "url": "..." }
 *  - stdio entries use same shape but no "type" field needed
 */
function toClientFormat(servers, resolveCredential) {
  const vsServers = {};

  for (const [name, def] of Object.entries(servers)) {
    if (def.disabled) continue;
    if (!def.clients?.includes('vscode')) continue;

    if (def.transport === 'stdio') {
      const entry = {
        command: def.command,
        args:    def.args || [],
      };
      if (def.env && Object.keys(def.env).length > 0) {
        entry.env = {};
        for (const [k, v] of Object.entries(def.env)) {
          entry.env[k] = v.startsWith('vault:') ? resolveCredential(v.slice(6)) : v;
        }
      }
      vsServers[name] = entry;

    } else if (def.transport === 'http') {
      // VS Code requires explicit "type": "http"
      const entry = {
        type: 'http',
        url:  def.url,
      };
      if (def.headers && Object.keys(def.headers).length > 0) {
        entry.headers = {};
        for (const [k, v] of Object.entries(def.headers)) {
          entry.headers[k] = v.startsWith('vault:') ? resolveCredential(v.slice(6)) : v;
        }
      }
      vsServers[name] = entry;
    }
  }

  return vsServers;
}

/**
 * VS Code "servers" format → .mcp.json servers format.
 * Normalises the "type" field back out — not part of the portable spec.
 */
function fromClientFormat(vsServers) {
  const servers     = {};
  const credentials = {};

  for (const [name, def] of Object.entries(vsServers)) {

    // stdio — has command field
    if (def.command) {
      const server = {
        transport: 'stdio',
        command:   def.command,
        args:      def.args || [],
        clients:   ['vscode'],
      };
      if (def.env && Object.keys(def.env).length > 0) {
        server.env = {};
        for (const [k, v] of Object.entries(def.env)) {
          if (looksLikeSecret(v)) {
            const vaultKey        = `${name}-${k.toLowerCase().replace(/_/g, '-')}`;
            server.env[k]         = `vault:${vaultKey}`;
            credentials[vaultKey] = v;
          } else {
            server.env[k] = v;
          }
        }
      }
      servers[name] = server;

    // http — type: "http" or has url
    } else if (def.type === 'http' || def.url) {
      const server = {
        transport: 'http',
        url:       def.url,
        clients:   ['vscode'],
      };
      if (def.headers && Object.keys(def.headers).length > 0) {
        server.headers = {};
        for (const [k, v] of Object.entries(def.headers)) {
          if (looksLikeSecret(v)) {
            const vaultKey        = `${name}-${k.toLowerCase().replace(/-/g, '-')}`;
            server.headers[k]     = `vault:${vaultKey}`;
            credentials[vaultKey] = v;
          } else {
            server.headers[k] = v;
          }
        }
      }
      servers[name] = server;
    }
  }

  return { servers, credentials };
}

function looksLikeSecret(value) {
  if (!value || typeof value !== 'string') return false;
  if (value.length < 8) return false;
  if (/^(sk-|ghp_|Bearer |pk_|rk_|stripe_|xoxb-|xoxp-)/.test(value)) return true;
  if (value.length >= 20 && /^[A-Za-z0-9_\-\.]+$/.test(value)) return true;
  return false;
}

// ── Connector interface ───────────────────────────────────────────────────────

export const vscodeConnector = {
  id:   'vscode',
  name: 'VS Code',
  configPath: getWorkspaceConfigPath,

  sync(servers, resolveCredential, scope = 'workspace') {
    const existing  = read(scope);
    const vsServers = toClientFormat(servers, resolveCredential);
    // VS Code root key is "servers" — not "mcpServers"
    const updated   = { ...existing, servers: vsServers };
    write(updated, scope);
    const count = Object.keys(vsServers).length;
    console.log(`[vscode] ✓ synced ${count} server${count !== 1 ? 's' : ''} → ${getConfigPath(scope)}`);
    console.log(`[vscode] ℹ  note: VS Code uses "servers" root key — do not manually rename to "mcpServers"`);
    return { synced: count };
  },

  export(scope = 'workspace') {
    const config    = read(scope);
    // handle both "servers" (correct) and "mcpServers" (common mistake)
    const vsServers = config.servers || config.mcpServers || {};
    const count     = Object.keys(vsServers).length;
    if (count === 0) {
      console.log(`[vscode] no servers found in ${getConfigPath(scope)}`);
      return { servers: {}, credentials: {} };
    }
    const result = fromClientFormat(vsServers);
    console.log(`[vscode] ✓ exported ${count} server${count !== 1 ? 's' : ''}`);
    if (Object.keys(result.credentials).length > 0) {
      console.log(`[vscode] ⚠  ${Object.keys(result.credentials).length} credential(s) detected — store these in the vault`);
    }
    return result;
  },

  status(scope = 'workspace') {
    const config = read(scope);
    return Object.keys(config.servers || config.mcpServers || {});
  },

  diff(servers, resolveCredential, scope = 'workspace') {
    const config     = read(scope);
    const current    = config.servers || config.mcpServers || {};
    const incoming   = toClientFormat(servers, resolveCredential);
    const currentKeys  = new Set(Object.keys(current));
    const incomingKeys = new Set(Object.keys(incoming));
    return {
      add:    [...incomingKeys].filter(k => !currentKeys.has(k)),
      remove: [...currentKeys].filter(k => !incomingKeys.has(k)),
      change: [...incomingKeys].filter(k =>
        currentKeys.has(k) &&
        JSON.stringify(current[k]) !== JSON.stringify(incoming[k])
      ),
    };
  },
};