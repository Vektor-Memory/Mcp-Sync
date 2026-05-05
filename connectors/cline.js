/**
 * connectors/cline.js
 *
 * Reads and writes Cline MCP config.
 * Extension ID: saoudrizwan.claude-dev
 *
 * Config file locations (platform-specific globalStorage path):
 *   Win   : %APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json
 *   macOS : ~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
 *   Linux : ~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
 *
 * Root key: "mcpServers" — same shape as Claude Desktop.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join }                                                from 'path';
import { homedir }                                             from 'os';

const EXT_ID = 'saoudrizwan.claude-dev';

function getConfigPath() {
  const base = (() => {
    if (process.platform === 'win32')
      return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Code', 'User', 'globalStorage');
    if (process.platform === 'darwin')
      return join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'globalStorage');
    return join(homedir(), '.config', 'Code', 'User', 'globalStorage');
  })();
  return join(base, EXT_ID, 'settings', 'cline_mcp_settings.json');
}

function looksLikeSecret(str) {
  if (typeof str !== 'string' || str.startsWith('vault:')) return false;
  if (str.includes('\\') || str.includes('/')) return false; // skip paths
  return str.length > 12 && /[A-Za-z]/.test(str) && /[0-9]/.test(str) && !/^[a-z0-9_:-]+$/.test(str);
}

export function detect() { return existsSync(getConfigPath()); }

export function exportConfig() {
  const cfgPath = getConfigPath();
  if (!existsSync(cfgPath)) return { servers: {} };
  let raw = {};
  try { raw = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { return { servers: {} }; }
  return { servers: raw.mcpServers ?? {} };
}

export function sync(mcpJson) {
  const cfgPath = getConfigPath();
  mkdirSync(join(cfgPath, '..'), { recursive: true });
  let existing = {};
  if (existsSync(cfgPath)) {
    try { existing = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /**/ }
  }
  const incoming = mcpJson.servers ?? {};
  for (const [name, cfg] of Object.entries(incoming)) {
    for (const [k, v] of Object.entries(cfg.env ?? {})) {
      if (looksLikeSecret(v))
        console.warn(`  cline: ${name}.env.${k} looks like a plaintext secret — use vault:key-name`);
    }
  }
  const { mcpServers: _, ...rest } = existing;
  const merged = { ...rest, mcpServers: { ...(existing.mcpServers ?? {}), ...incoming } };
  writeFileSync(cfgPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  return { written: cfgPath, count: Object.keys(merged.mcpServers).length };
}

export function status() {
  const cfgPath = getConfigPath();
  if (!existsSync(cfgPath)) return { installed: false, path: cfgPath, servers: [] };
  let raw = {};
  try { raw = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /**/ }
  return { installed: true, path: cfgPath, servers: Object.keys(raw.mcpServers ?? {}) };
}

export default { detect, export: exportConfig, sync, status };
