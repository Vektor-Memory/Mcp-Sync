#!/usr/bin/env node
/**
 * mcp-sync — CLI entry point
 * Commands: vault, sync, export, status, diff, init
 */

import { readFileSync }                          from 'fs';
import { resolve }                               from 'path';
import * as mcpfile                              from './utils/mcpfile.js';
import * as vault                                from './utils/vault.js';
import { claudeDesktop, cursor, vscode, windsurf, claudeCode } from './connectors/index.js';

const CONNECTORS = { claudeDesktop, cursor, vscode, windsurf, claudeCode };
const CONNECTOR_NAMES = Object.keys(CONNECTORS);

// ── CLI arg parsing ────────────────────────────────────────────────────────

const [,, cmd, ...args] = process.argv;

function flag(name)      { return args.includes(`--${name}`); }
function opt(name)       { const i = args.indexOf(`--${name}`); return i !== -1 ? args[i + 1] : null; }
function positional(i)   { return args.filter(a => !a.startsWith('--'))[i]; }

// ── Helpers ────────────────────────────────────────────────────────────────

function getMcpFile() {
  const f = opt('file') ?? mcpfile.findMcpFile();
  if (!f) { console.error('No .mcp.json found — run: mcp-sync init'); process.exit(1); }
  return f;
}

function getConnectors() {
  const only = opt('only');
  if (only) {
    const names = only.split(',').map(s => s.trim());
    const bad   = names.filter(n => !CONNECTORS[n]);
    if (bad.length) { console.error(`Unknown connector(s): ${bad.join(', ')}\nValid: ${CONNECTOR_NAMES.join(', ')}`); process.exit(1); }
    return Object.fromEntries(names.map(n => [n, CONNECTORS[n]]));
  }
  return CONNECTORS;
}

// ── Commands ───────────────────────────────────────────────────────────────

function cmdInit() {
  const filePath    = opt('file') ?? resolve(process.cwd(), '.mcp.json');
  const description = opt('description') ?? '';
  try {
    mcpfile.init(filePath, description);
    console.log(`Created ${filePath}`);
  } catch (err) {
    console.error(err.message); process.exit(1);
  }
}

function cmdSync() {
  const filePath = getMcpFile();
  const mcp      = mcpfile.read(filePath);
  const conns    = getConnectors();
  let   anyErr   = false;
  for (const [name, conn] of Object.entries(conns)) {
    try {
      const result = conn.sync(mcp);
      console.log(`✓ ${name}: wrote ${result.count} server(s) → ${result.written}`);
    } catch (err) {
      console.error(`✗ ${name}: ${err.message}`);
      anyErr = true;
    }
  }
  // Stamp lastSync
  mcpfile.write(filePath, mcp);
  if (anyErr) process.exit(1);
}

function cmdExport() {
  const filePath = getMcpFile();
  const existing = existsSilent(filePath) ? mcpfile.read(filePath) : { mcpSync: { version: '1.0' }, servers: {} };
  const conns    = getConnectors();
  let   merged   = existing;
  for (const [name, conn] of Object.entries(conns)) {
    try {
      const partial = conn.export();
      merged = mcpfile.merge(merged, partial);
      console.log(`✓ ${name}: exported ${Object.keys(partial.servers).length} server(s)`);
    } catch (err) {
      console.error(`✗ ${name}: ${err.message}`);
    }
  }
  mcpfile.write(filePath, merged);
  console.log(`Saved → ${filePath}`);
}

function existsSilent(p) { try { readFileSync(p); return true; } catch { return false; } }

function cmdStatus() {
  const conns = getConnectors();
  for (const [name, conn] of Object.entries(conns)) {
    try {
      const s = conn.status();
      if (s.installed) {
        console.log(`✓ ${name}: ${s.servers.length} server(s) — ${s.path}`);
        if (s.servers.length) console.log(`    ${s.servers.join(', ')}`);
        if (s.scope) console.log(`    scope: ${s.scope}`);
      } else {
        console.log(`- ${name}: not installed (${s.path})`);
      }
    } catch (err) {
      console.error(`✗ ${name}: ${err.message}`);
    }
  }
}

function cmdDiff() {
  const filePath = getMcpFile();
  const mcp      = mcpfile.read(filePath);
  const conns    = getConnectors();
  let   anyDiff  = false;
  for (const [name, conn] of Object.entries(conns)) {
    try {
      const current = conn.export();
      const diff    = mcpfile.diffServers(current, mcp);
      if (!diff.added.length && !diff.removed.length && !diff.changed.length) {
        console.log(`✓ ${name}: in sync`);
      } else {
        anyDiff = true;
        console.log(`≠ ${name}:`);
        if (diff.added.length)   console.log(`    + ${diff.added.join(', ')}`);
        if (diff.removed.length) console.log(`    - ${diff.removed.join(', ')}`);
        if (diff.changed.length) console.log(`    ~ ${diff.changed.join(', ')}`);
      }
    } catch (err) {
      console.error(`✗ ${name}: ${err.message}`);
    }
  }
  if (anyDiff) process.exit(1); // non-zero exit = drift detected (useful in CI)
}

function cmdVault() {
  const sub = positional(0);
  if (sub === 'set') {
    const name  = positional(1);
    const value = positional(2);
    if (!name || !value) { console.error('Usage: mcp-sync vault set <name> <value>'); process.exit(1); }
    vault.set(name, value);
    console.log(`vault: stored "${name}"`);
  } else if (sub === 'get') {
    const name = positional(1);
    if (!name) { console.error('Usage: mcp-sync vault get <name>'); process.exit(1); }
    const val = vault.get(name);
    if (val === null) { console.error(`vault: no entry for "${name}"`); process.exit(1); }
    console.log(val);
  } else if (sub === 'delete') {
    const name = positional(1);
    if (!name) { console.error('Usage: mcp-sync vault delete <name>'); process.exit(1); }
    vault.remove(name);
    console.log(`vault: deleted "${name}"`);
  } else if (sub === 'list') {
    const keys = vault.list();
    if (!keys.length) console.log('vault: empty');
    else keys.forEach(k => console.log(k));
  } else {
    console.error('Usage: mcp-sync vault <set|get|delete|list> [name] [value]');
    process.exit(1);
  }
}

function cmdHelp() {
  console.log(`
mcp-sync — sync MCP server configs across editors

Commands:
  init                     Create a .mcp.json in the current directory
  sync                     Push .mcp.json → all installed editors
  export                   Pull from all editors → .mcp.json
  status                   Show what's installed and how many servers
  diff                     Show drift between .mcp.json and editors
  vault set <name> <val>   Store a secret (encrypted, machine-bound)
  vault get <name>         Retrieve a secret
  vault delete <name>      Remove a secret
  vault list               List all stored secret names

Options:
  --file <path>            Path to .mcp.json (default: walk up from cwd)
  --only <name[,name]>     Limit to specific connector(s)
  --description <text>     Description for init

Connectors: ${CONNECTOR_NAMES.join(', ')}
`);
}

// ── Dispatch ───────────────────────────────────────────────────────────────

switch (cmd) {
  case 'init':    cmdInit();    break;
  case 'sync':    cmdSync();    break;
  case 'export':  cmdExport();  break;
  case 'status':  cmdStatus();  break;
  case 'diff':    cmdDiff();    break;
  case 'vault':   cmdVault();   break;
  case 'help':
  case '--help':
  case '-h':      cmdHelp();    break;
  default:
    console.error(`Unknown command: ${cmd ?? '(none)'}\nRun: mcp-sync help`);
    process.exit(1);
}