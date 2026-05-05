/**
 * connectors/claude-desktop.js
 *
 * Reads and writes Claude Desktop MCP config.
 *
 * Config file locations:
 *   Windows : %APPDATA%\Claude\claude_desktop_config.json
 *   macOS   : ~/Library/Application Support/Claude/claude_desktop_config.json
 *   Linux   : ~/.config/Claude/claude_desktop_config.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join }                                                from 'path';
import { homedir }                                             from 'os';

// ── Config path resolution ────────────────────────────────────────────────────

function getConfigPath() {
  const platform = process.platform;
  if (platform === 'win32') {
    return join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
  }
  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  // linux
  return join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Read the current Claude Desktop config.
 * Returns { mcpServers: {} } if file missing or empty.
 */
function read() {
  const path = getConfigPath();
  if (!existsSync(path)) return { mcpServers: {} };
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`[claude-desktop] failed to parse config at ${path}: ${e.message}`);
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Write a full Claude Desktop config object back to disk.
 * Creates the directory if missing.
 */
function write(config) {
  const path = getConfigPath();
  const dir  = join(path, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf8');
}

// ── Export: read .mcp.json servers → Claude Desktop format ───────────────────

/**
 * Convert a .mcp.json servers map → claude_desktop_config mcpServers block.
 * Filters to only servers that include 'claude-desktop' in their clients array.
 * Resolves vault: credential references using the provided resolveCredential fn.
 *
 * @param {object} servers          - .mcp.json servers map
 * @param {function} resolveCredential - (vaultRef: string) => string plaintext
 * @returns {object} mcpServers block ready for claude_desktop_config.json
 */
function toClientFormat(servers, resolveCredential) {
  const mcpServers = {};

  for (const [name, def] of Object.entries(servers)) {
    if (def.disabled) continue;
    if (!def.clients?.includes('claude-desktop')) continue;

    if (def.transport === 'stdio') {
      const entry = {
        command: def.command,
        args:    def.args || [],
      };

      // resolve env credentials
      if (def.env && Object.keys(def.env).length > 0) {
        entry.env = {};
        for (const [k, v] of Object.entries(def.env)) {
          entry.env[k] = v.startsWith('vault:')
            ? resolveCredential(v.slice(6))
            : v;
        }
      }

      mcpServers[name] = entry;

    } else if (def.transport === 'http') {
      const entry = { url: def.url };

      // resolve header credentials
      if (def.headers && Object.keys(def.headers).length > 0) {
        entry.headers = {};
        for (const [k, v] of Object.entries(def.headers)) {
          entry.headers[k] = v.startsWith('vault:')
            ? resolveCredential(v.slice(6))
            : v;
        }
      }

      mcpServers[name] = entry;
    }
  }

  return mcpServers;
}

// ── Import: Claude Desktop config → .mcp.json servers format ─────────────────

/**
 * Convert an existing claude_desktop_config.json mcpServers block
 * → .mcp.json servers format.
 *
 * Credentials found in env/headers are extracted into vault refs
 * and returned separately for the caller to store in the vault.
 *
 * @param {object} mcpServers - raw mcpServers from claude_desktop_config.json
 * @returns {{ servers: object, credentials: object }}
 *   servers     — .mcp.json-compatible server definitions
 *   credentials — { vaultKey: plaintextValue } to store in vault
 */
function fromClientFormat(mcpServers) {
  const servers     = {};
  const credentials = {};

  for (const [name, def] of Object.entries(mcpServers)) {

    // ── stdio ──
    if (def.command) {
      const server = {
        transport: 'stdio',
        command:   def.command,
        args:      def.args || [],
        clients:   ['claude-desktop'],
      };

      if (def.env && Object.keys(def.env).length > 0) {
        server.env = {};
        for (const [k, v] of Object.entries(def.env)) {
          // heuristic: if value looks like a token/key, vault it
          if (looksLikeSecret(v)) {
            const vaultKey = `${name}-${k.toLowerCase().replace(/_/g, '-')}`;
            server.env[k]        = `vault:${vaultKey}`;
            credentials[vaultKey] = v;
          } else {
            server.env[k] = v;
          }
        }
      }

      servers[name] = server;

    // ── http ──
    } else if (def.url || def.serverUrl) {
      const server = {
        transport: 'http',
        url:       def.url || def.serverUrl,
        clients:   ['claude-desktop'],
      };

      if (def.headers && Object.keys(def.headers).length > 0) {
        server.headers = {};
        for (const [k, v] of Object.entries(def.headers)) {
          if (looksLikeSecret(v)) {
            const vaultKey = `${name}-${k.toLowerCase().replace(/-/g, '-')}`;
            server.headers[k]    = `vault:${vaultKey}`;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Heuristic: does this string look like a secret/token/key?
 * Vaults anything that looks like a token, key, or long opaque string.
 */
function looksLikeSecret(value) {
  if (!value || typeof value !== 'string') return false;
  if (value.length < 8) return false;
  // common token patterns
  if (/^(sk-|ghp_|Bearer |pk_|rk_|stripe_|xoxb-|xoxp-)/.test(value)) return true;
  // long opaque strings (likely API keys)
  if (value.length >= 20 && /^[A-Za-z0-9_\-\.]+$/.test(value)) return true;
  return false;
}

// ── Connector interface ───────────────────────────────────────────────────────

export const claudeDesktopConnector = {
  id:          'claude-desktop',
  name:        'Claude Desktop',
  configPath:  getConfigPath,

  /**
   * SYNC — write .mcp.json servers → Claude Desktop config.
   * Merges with existing config (preserves non-MCP keys like preferences).
   */
  sync(servers, resolveCredential) {
    const existing   = read();
    const mcpServers = toClientFormat(servers, resolveCredential);

    const updated = {
      ...existing,
      mcpServers,
    };

    write(updated);

    const count = Object.keys(mcpServers).length;
    console.log(`[claude-desktop] ✓ synced ${count} server${count !== 1 ? 's' : ''} → ${getConfigPath()}`);
    return { synced: count };
  },

  /**
   * EXPORT — read Claude Desktop config → .mcp.json format.
   * Returns servers + credentials to vault.
   */
  export() {
    const config     = read();
    const mcpServers = config.mcpServers || {};
    const count      = Object.keys(mcpServers).length;

    if (count === 0) {
      console.log(`[claude-desktop] no servers found in ${getConfigPath()}`);
      return { servers: {}, credentials: {} };
    }

    const result = fromClientFormat(mcpServers);
    console.log(`[claude-desktop] ✓ exported ${count} server${count !== 1 ? 's' : ''}`);
    if (Object.keys(result.credentials).length > 0) {
      console.log(`[claude-desktop] ⚠  ${Object.keys(result.credentials).length} credential(s) detected — store these in the vault`);
    }
    return result;
  },

  /**
   * STATUS — return current server names in Claude Desktop config.
   */
  status() {
    const config = read();
    return Object.keys(config.mcpServers || {});
  },

  /**
   * DIFF — compare .mcp.json servers against current Claude Desktop config.
   * Returns { add, remove, change } — what would change on next sync.
   */
  diff(servers, resolveCredential) {
    const current  = read().mcpServers || {};
    const incoming = toClientFormat(servers, resolveCredential);

    const currentKeys  = new Set(Object.keys(current));
    const incomingKeys = new Set(Object.keys(incoming));

    const add    = [...incomingKeys].filter(k => !currentKeys.has(k));
    const remove = [...currentKeys].filter(k => !incomingKeys.has(k));
    const change = [...incomingKeys].filter(k => {
      if (!currentKeys.has(k)) return false;
      return JSON.stringify(current[k]) !== JSON.stringify(incoming[k]);
    });

    return { add, remove, change };
  },
};