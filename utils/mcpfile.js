/**
 * utils/mcpfile.js
 * Read, write, validate and merge .mcp.json — the mcp-sync source of truth.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve as resolvePath }                  from 'path';

const MCP_FILE_NAME  = '.mcp.json';
const SCHEMA_VERSION = '1.0';

export function findMcpFile(startDir = process.cwd()) {
  let dir = resolvePath(startDir);
  while (true) {
    const candidate = resolvePath(dir, MCP_FILE_NAME);
    if (existsSync(candidate)) return candidate;
    const parent = resolvePath(dir, '..');
    if (parent === dir) return null;
    dir = parent;
  }
}

export function read(filePath) {
  if (!existsSync(filePath)) throw new Error(`mcpfile: not found — ${filePath}`);
  let raw;
  try { raw = JSON.parse(readFileSync(filePath, 'utf8')); }
  catch (err) { throw new Error(`mcpfile: JSON parse error in ${filePath} — ${err.message}`); }
  validate(raw, filePath);
  return raw;
}

export function validate(obj, filePath = '.mcp.json') {
  if (!obj || typeof obj !== 'object')      throw new Error(`mcpfile: ${filePath} must be a JSON object`);
  if (!obj.mcpSync)                         throw new Error(`mcpfile: ${filePath} missing "mcpSync" meta block`);
  if (!obj.mcpSync.version)                 throw new Error(`mcpfile: ${filePath} mcpSync.version is required`);
  if (!obj.servers || typeof obj.servers !== 'object')
                                            throw new Error(`mcpfile: ${filePath} missing or invalid "servers" block`);
  for (const [name, cfg] of Object.entries(obj.servers)) {
    if (!cfg || typeof cfg !== 'object')    throw new Error(`mcpfile: server "${name}" must be an object`);
    if (!cfg.command && !cfg.url)           throw new Error(`mcpfile: server "${name}" needs "command" (stdio) or "url" (SSE)`);
  }
}

export function write(filePath, obj) {
  const out = {
    ...obj,
    mcpSync: { ...obj.mcpSync, version: obj.mcpSync?.version ?? SCHEMA_VERSION, lastSync: new Date().toISOString() },
  };
  writeFileSync(filePath, JSON.stringify(out, null, 2) + '\n', 'utf8');
}

export function init(filePath, description = '') {
  if (existsSync(filePath)) throw new Error(`mcpfile: ${filePath} already exists — use --force to overwrite`);
  const obj = {
    mcpSync:  { version: SCHEMA_VERSION, lastSync: new Date().toISOString(), ...(description ? { description } : {}) },
    servers:  {},
  };
  writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  return obj;
}

export function merge(base, incoming) {
  const { credentials: _, ...safeIncoming } = incoming;
  return {
    mcpSync:  { ...base.mcpSync, lastSync: new Date().toISOString() },
    servers:  { ...base.servers, ...safeIncoming.servers },
  };
}

export function diffServers(a, b) {
  const aKeys = new Set(Object.keys(a.servers ?? {}));
  const bKeys = new Set(Object.keys(b.servers ?? {}));
  const added   = [...bKeys].filter(k => !aKeys.has(k));
  const removed = [...aKeys].filter(k => !bKeys.has(k));

  const CANONICAL = ['command', 'args', 'url', 'headers'];

  function normaliseEnv(env = {}) {
    // Mask vault refs and known secrets — only compare keys, not values
    return Object.keys(env).sort().join(',');
  }

  function canonical(cfg) {
    const out = {};
    for (const k of CANONICAL) if (cfg[k] !== undefined) out[k] = cfg[k];
    out.__envKeys = normaliseEnv(cfg.env);
    return JSON.stringify(out);
  }

  const changed = [...aKeys].filter(k =>
    bKeys.has(k) && canonical(a.servers[k]) !== canonical(b.servers[k])
  );
  return { added, removed, changed };
}

export default { findMcpFile, read, validate, write, init, merge, diffServers };