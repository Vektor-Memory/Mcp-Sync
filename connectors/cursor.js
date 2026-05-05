/**
 * connectors/cursor.js
 *
 * Reads and writes Cursor MCP config.
 *
 * Config file locations:
 *   Global  : ~/.cursor/mcp.json
 *   Project : .cursor/mcp.json  (cwd)
 *
 * Root key: "mcpServers" — same as Claude Desktop.
 * Supports both stdio and http transport.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve }                                       from 'path';
import { homedir }                                             from 'os';

// ── Config path resolution ────────────────────────────────────────────────────

function getGlobalConfigPath() {
  return join(homedir(), '.cursor', 'mcp.json');
}

function getProjectConfigPath() {
  return resolve(process.cwd(), '.cursor', 'mcp.json');
}

function getConfigPath(scope = 'global') {
  return scope === 'project' ? getProjectConfigPath() : getGlobalConfigPath();
}

// ── Read / Write ──────────────────────────────────────────────────────────────

function read(scope = 'global') {
  const path = getConfigPath(scope);
  if (!existsSync(path)) return { mcpServers: {} };
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`[cursor] failed to parse config at ${path}: ${e.message}`);
  }
}

function write(config, scope = 'global') {
  const path = getConfigPath(scope);
  const dir  = join(path, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf8');
}

// ── Format conversion ─────────────────────────────────────────────────────────

function toClientFormat(servers, resolveCredential, clientId = 'cursor') {
  const mcpServers = {};

  for (const [name, def] of Object.entries(servers)) {
    if (def.disabled) continue;
    if (!def.clients?.includes(clientId)) continue;

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
      mcpServers[name] = entry;

    } else if (def.transport === 'http') {
      const entry = { url: def.url };
      if (def.headers && Object.keys(def.headers).length > 0) {
        entry.headers = {};
        for (const [k, v] of Object.entries(def.headers)) {
          entry.headers[k] = v.startsWith('vault:') ? resolveCredential(v.slice(6)) : v;
        }
      }
      mcpServers[name] = entry;
    }
  }

  return mcpServers;
}

function fromClientFormat(mcpServers, clientId = 'cursor') {
  const servers     = {};
  const credentials = {};

  for (const [name, def] of Object.entries(mcpServers)) {
    if (def.command) {
      const server = {
        transport: 'stdio',
        command:   def.command,
        args:      def.args || [],
        clients:   [clientId],
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

    } else if (def.url || def.serverUrl) {
      const server = {
        transport: 'http',
        url:       def.url || def.serverUrl,
        clients:   [clientId],
      };
      if (def.headers && Object.keys(def.headers).length > 0) {
        server.headers = {};
        for (const [k, v] of Object.entries(def.headers)) {
          if (looksLikeSecret(v)) {
            const vaultKey           = `${name}-${k.toLowerCase().replace(/-/g, '-')}`;
            server.headers[k]        = `vault:${vaultKey}`;
            credentials[vaultKey]    = v;
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

export const cursorConnector = {
  id:   'cursor',
  name: 'Cursor',
  configPath: getGlobalConfigPath,

  sync(servers, resolveCredential, scope = 'global') {
    const existing   = read(scope);
    const mcpServers = toClientFormat(servers, resolveCredential, 'cursor');
    const updated    = { ...existing, mcpServers };
    write(updated, scope);
    const count = Object.keys(mcpServers).length;
    console.log(`[cursor] ✓ synced ${count} server${count !== 1 ? 's' : ''} → ${getConfigPath(scope)}`);
    return { synced: count };
  },

  export(scope = 'global') {
    const config     = read(scope);
    const mcpServers = config.mcpServers || {};
    const count      = Object.keys(mcpServers).length;
    if (count === 0) {
      console.log(`[cursor] no servers found in ${getConfigPath(scope)}`);
      return { servers: {}, credentials: {} };
    }
    const result = fromClientFormat(mcpServers, 'cursor');
    console.log(`[cursor] ✓ exported ${count} server${count !== 1 ? 's' : ''}`);
    if (Object.keys(result.credentials).length > 0) {
      console.log(`[cursor] ⚠  ${Object.keys(result.credentials).length} credential(s) detected — store these in the vault`);
    }
    return result;
  },

  status(scope = 'global') {
    return Object.keys(read(scope).mcpServers || {});
  },

  diff(servers, resolveCredential, scope = 'global') {
    const current    = read(scope).mcpServers || {};
    const incoming   = toClientFormat(servers, resolveCredential, 'cursor');
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