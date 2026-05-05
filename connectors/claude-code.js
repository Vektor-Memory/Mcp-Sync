/**
 * connectors/claude-code.js
 * ~/.claude/claude_desktop_config.json  (same format as Claude Desktop)
 * Claude Code shares the Desktop format — mcpServers top-level key.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join }                                                from 'path';
import { homedir }                                             from 'os';

function getConfigPath() {
  return join(homedir(), '.claude', 'claude_desktop_config.json');
}

function looksLikeSecret(str) {
  if (typeof str !== 'string' || str.startsWith('vault:')) return false;
  if (str.includes('\\') || str.includes('/')) return false; // skip paths
  return str.length > 12 && /[A-Za-z]/.test(str) && /[0-9]/.test(str) && !/^[a-z0-9_:-]+$/.test(str);
}

export function detect() { return existsSync(join(homedir(), '.claude')); }

export function exportConfig() {
  const cfgPath = getConfigPath();
  if (!existsSync(cfgPath)) return { servers: {} };
  let raw = {};
  try { raw = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { return { servers: {} }; }
  return { servers: raw.mcpServers ?? {} };
}

export function sync(mcpJson) {
  const cfgPath = getConfigPath();
  mkdirSync(join(homedir(), '.claude'), { recursive: true });
  let existing = {};
  if (existsSync(cfgPath)) try { existing = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /**/ }
  const incoming = mcpJson.servers ?? {};
  for (const [name, cfg] of Object.entries(incoming)) {
    for (const [k, v] of Object.entries(cfg.env ?? {})) {
      if (looksLikeSecret(v)) console.warn(`  claude-code: ${name}.env.${k} looks like a plaintext secret — use vault:key-name`);
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