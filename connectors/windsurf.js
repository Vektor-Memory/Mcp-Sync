/**
 * connectors/windsurf.js
 * ~/.codeium/windsurf/mcp_config.json
 * Quirk: uses "serverUrl" instead of "url" for SSE servers.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join }                                                from 'path';
import { homedir }                                             from 'os';

function getConfigPath() {
  return join(homedir(), '.codeium', 'windsurf', 'mcp_config.json');
}

function looksLikeSecret(str) {
  if (typeof str !== 'string' || str.startsWith('vault:')) return false;
  if (str.includes('\\') || str.includes('/')) return false; // skip paths
  return str.length > 12 && /[A-Za-z]/.test(str) && /[0-9]/.test(str) && !/^[a-z0-9_:-]+$/.test(str);
}

function toWindsurf(servers) {
  const out = {};
  for (const [name, cfg] of Object.entries(servers)) {
    if (cfg.url) { const { url, ...rest } = cfg; out[name] = { serverUrl: url, ...rest }; }
    else         { out[name] = { ...cfg }; }
  }
  return out;
}

function fromWindsurf(mcpServers) {
  const out = {};
  for (const [name, cfg] of Object.entries(mcpServers)) {
    if (cfg.serverUrl) { const { serverUrl, ...rest } = cfg; out[name] = { url: serverUrl, ...rest }; }
    else               { out[name] = { ...cfg }; }
  }
  return out;
}

export function detect() { return existsSync(getConfigPath()); }

export function exportConfig() {
  const cfgPath = getConfigPath();
  if (!existsSync(cfgPath)) return { servers: {} };
  let raw = {};
  try { raw = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { return { servers: {} }; }
  return { servers: fromWindsurf(raw.mcpServers ?? {}) };
}

export function sync(mcpJson) {
  const cfgPath = getConfigPath();
  mkdirSync(join(homedir(), '.codeium', 'windsurf'), { recursive: true });
  let existing = {};
  if (existsSync(cfgPath)) try { existing = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /**/ }
  const incoming = toWindsurf(mcpJson.servers ?? {});
  for (const [name, cfg] of Object.entries(incoming)) {
    for (const [k, v] of Object.entries({ ...cfg.env, ...cfg.headers })) {
      if (looksLikeSecret(v)) console.warn(`  windsurf: ${name}.${k} looks like a plaintext secret — use vault:key-name`);
    }
  }
  const { mcpServers: _, ...rest } = existing;
  writeFileSync(cfgPath, JSON.stringify({ ...rest, mcpServers: { ...(existing.mcpServers ?? {}), ...incoming } }, null, 2) + '\n', 'utf8');
  return { written: cfgPath, count: Object.keys({ ...(existing.mcpServers ?? {}), ...incoming }).length };
}

export function status() {
  const cfgPath = getConfigPath();
  if (!existsSync(cfgPath)) return { installed: false, path: cfgPath, servers: [] };
  let raw = {};
  try { raw = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /**/ }
  return { installed: true, path: cfgPath, servers: Object.keys(raw.mcpServers ?? {}) };
}

export default { detect, export: exportConfig, sync, status };