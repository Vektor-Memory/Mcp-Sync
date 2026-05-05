/**
 * connectors/codex.js
 *
 * Reads and writes OpenAI Codex CLI MCP config.
 *
 * Config file:
 *   Win   : %USERPROFILE%\.codex\config.toml
 *   macOS : ~/.codex/config.toml
 *   Linux : ~/.codex/config.toml
 *
 * FORMAT DIFFERENCE: Codex uses TOML, not JSON.
 * MCP servers live under [mcp_servers.<name>] sections.
 *
 *   [mcp_servers.filesystem]
 *   command = "npx"
 *   args = ["-y", "@modelcontextprotocol/server-filesystem", "/home"]
 *   env = { API_KEY = "secret" }
 *   startup_timeout_ms = 60000
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join }                                                from 'path';
import { homedir }                                             from 'os';

function getConfigPath() {
  return join(homedir(), '.codex', 'config.toml');
}

// ── Minimal TOML parser (Codex subset only) ───────────────────────────────

function parseTomlString(val) {
  return val.trim().replace(/^["']|["']$/g, '');
}

function parseTomlArray(val) {
  const s = val.trim();
  if (!s.startsWith('[')) return [];
  try {
    // TOML simple arrays are JSON-compatible for string/number elements
    return JSON.parse(s);
  } catch {
    return [...s.matchAll(/"([^"]*)"/g)].map(m => m[1]);
  }
}

function parseTomlInlineTable(val) {
  const s = val.trim();
  if (!s.startsWith('{')) return {};
  const inner = s.slice(1, s.lastIndexOf('}'));
  const obj = {};
  // split on commas not inside quotes
  const pairs = inner.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const k = pair.slice(0, eq).trim();
    const v = parseTomlString(pair.slice(eq + 1));
    if (k) obj[k] = v;
  }
  return obj;
}

function parseCodexToml(content) {
  const servers = {};
  let currentName = null;

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    // [mcp_servers.<name>]
    const sec = line.match(/^\[mcp_servers\.(.+?)\]$/);
    if (sec) {
      currentName = sec[1];
      servers[currentName] = {};
      continue;
    }

    // Skip non-mcp sections
    if (line.startsWith('[')) { currentName = null; continue; }

    if (!currentName) continue;

    const eq = line.indexOf(' = ');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 3).trim();

    if      (key === 'command') servers[currentName].command = parseTomlString(val);
    else if (key === 'args')    servers[currentName].args    = parseTomlArray(val);
    else if (key === 'env')     servers[currentName].env     = parseTomlInlineTable(val);
    // startup_timeout_ms and other keys are preserved via raw section retention
  }

  return servers;
}

// ── TOML writer (Codex subset) ────────────────────────────────────────────

function serverToToml(name, def) {
  const lines = [`[mcp_servers.${name}]`];
  if (def.command) lines.push(`command = ${JSON.stringify(def.command)}`);
  if (def.args?.length) lines.push(`args = ${JSON.stringify(def.args)}`);
  if (def.env && Object.keys(def.env).length) {
    const pairs = Object.entries(def.env).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(', ');
    lines.push(`env = { ${pairs} }`);
  }
  lines.push('startup_timeout_ms = 30000');
  return lines.join('\n');
}

/**
 * Remove all [mcp_servers.*] sections from TOML content.
 * Returns the rest of the file (non-mcp sections).
 */
function stripMcpSections(content) {
  const lines  = content.split('\n');
  const result = [];
  let inMcp    = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[mcp_servers\..+\]$/.test(trimmed)) { inMcp = true; continue; }
    if (trimmed.startsWith('[')) inMcp = false;
    if (!inMcp) result.push(line);
  }

  // Trim trailing blank lines
  while (result.length && !result[result.length - 1].trim()) result.pop();
  return result.join('\n');
}

// ── Connector interface ───────────────────────────────────────────────────

export function detect() { return existsSync(getConfigPath()); }

export function exportConfig() {
  const cfgPath = getConfigPath();
  if (!existsSync(cfgPath)) return { servers: {} };
  let content = '';
  try { content = readFileSync(cfgPath, 'utf8'); } catch { return { servers: {} }; }
  return { servers: parseCodexToml(content) };
}

export function sync(mcpJson) {
  const cfgPath = getConfigPath();
  mkdirSync(join(cfgPath, '..'), { recursive: true });
  let existing = '';
  if (existsSync(cfgPath)) try { existing = readFileSync(cfgPath, 'utf8'); } catch { /**/ }

  const base    = stripMcpSections(existing);
  const servers = mcpJson.servers ?? {};
  const newSections = Object.entries(servers)
    .map(([name, def]) => serverToToml(name, def))
    .join('\n\n');

  const output = [base, newSections].filter(Boolean).join('\n\n') + '\n';
  writeFileSync(cfgPath, output, 'utf8');
  return { written: cfgPath, count: Object.keys(servers).length };
}

export function status() {
  const cfgPath = getConfigPath();
  if (!existsSync(cfgPath)) return { installed: false, path: cfgPath, servers: [] };
  let content = '';
  try { content = readFileSync(cfgPath, 'utf8'); } catch { /**/ }
  const servers = Object.keys(parseCodexToml(content));
  return { installed: true, path: cfgPath, servers };
}

export default { detect, export: exportConfig, sync, status };
