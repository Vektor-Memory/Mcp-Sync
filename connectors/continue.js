/**
 * connectors/continue.js
 *
 * Reads and writes Continue VS Code extension MCP config.
 * Extension ID: continue.continue
 *
 * Config file:
 *   Win   : %USERPROFILE%\.continue\config.json
 *   macOS : ~/.continue/config.json
 *   Linux : ~/.continue/config.json
 *
 * FORMAT DIFFERENCE: Continue uses "mcpServers" as an ARRAY, not an object.
 * Each entry has a "name" field as the server identifier.
 *
 *   { "mcpServers": [{ "name": "...", "command": "...", "args": [...] }] }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join }                                                from 'path';
import { homedir }                                             from 'os';

function getConfigPath() {
  return join(homedir(), '.continue', 'config.json');
}

function looksLikeSecret(str) {
  if (typeof str !== 'string' || str.startsWith('vault:')) return false;
  if (str.includes('\\') || str.includes('/')) return false;
  return str.length > 12 && /[A-Za-z]/.test(str) && /[0-9]/.test(str) && !/^[a-z0-9_:-]+$/.test(str);
}

/** Convert .mcp.json servers object → Continue mcpServers array */
function toArray(servers) {
  return Object.entries(servers).map(([name, def]) => {
    const entry = { name };
    if (def.command) {
      entry.command = def.command;
      if (def.args?.length) entry.args = def.args;
      if (def.env && Object.keys(def.env).length) entry.env = def.env;
    } else if (def.url) {
      entry.url = def.url;
    }
    return entry;
  });
}

/** Convert Continue mcpServers array → .mcp.json servers object */
function fromArray(arr) {
  const servers = {};
  for (const entry of arr) {
    const { name, ...rest } = entry;
    if (!name) continue;
    servers[name] = rest;
  }
  return servers;
}

export function detect() { return existsSync(getConfigPath()); }

export function exportConfig() {
  const cfgPath = getConfigPath();
  if (!existsSync(cfgPath)) return { servers: {} };
  let raw = {};
  try { raw = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { return { servers: {} }; }
  const arr = raw.mcpServers;
  if (!Array.isArray(arr) || !arr.length) return { servers: {} };
  return { servers: fromArray(arr) };
}

export function sync(mcpJson) {
  const cfgPath = getConfigPath();
  mkdirSync(join(cfgPath, '..'), { recursive: true });
  let existing = {};
  if (existsSync(cfgPath)) try { existing = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /**/ }
  const incoming = mcpJson.servers ?? {};
  for (const [name, cfg] of Object.entries(incoming))
    for (const [k, v] of Object.entries(cfg.env ?? {}))
      if (looksLikeSecret(v)) console.warn(`  continue: ${name}.env.${k} looks like a plaintext secret — use vault:key-name`);
  // Merge: keep existing entries not in incoming, overwrite/add incoming
  const existingArr = Array.isArray(existing.mcpServers) ? existing.mcpServers : [];
  const existingMap = fromArray(existingArr);
  const merged = { ...existingMap, ...incoming };
  const updated = { ...existing, mcpServers: toArray(merged) };
  writeFileSync(cfgPath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
  return { written: cfgPath, count: toArray(merged).length };
}

export function status() {
  const cfgPath = getConfigPath();
  if (!existsSync(cfgPath)) return { installed: false, path: cfgPath, servers: [] };
  let raw = {};
  try { raw = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /**/ }
  const arr = Array.isArray(raw.mcpServers) ? raw.mcpServers : [];
  return { installed: true, path: cfgPath, servers: arr.map(e => e.name).filter(Boolean) };
}

export default { detect, export: exportConfig, sync, status };
