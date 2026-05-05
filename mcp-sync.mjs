#!/usr/bin/env node
/**
 * mcp-sync — CLI entry point
 * Commands: init, sync, export, status, diff, vault
 */

import { readFileSync, watch, existsSync }  from 'fs';
import { resolve }                           from 'path';
import { homedir }                           from 'os';
import * as mcpfile                          from './utils/mcpfile.js';
import * as vault                            from './utils/vault.js';
import {
  claudeDesktop, cursor, vscode, windsurf, claudeCode,
  cline, rooCode,
} from './connectors/index.js';
import { resolveObject } from './utils/vault.js';

const CONNECTORS      = { claudeDesktop, cursor, vscode, windsurf, claudeCode, cline, rooCode };
const CONNECTOR_NAMES = Object.keys(CONNECTORS);
const VERSION         = '0.2.0';

// ── PALETTE ───────────────────────────────────────────────────────────────

const _ = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  white:  '\x1b[97m',
  silver: '\x1b[37m',
  grey:   '\x1b[90m',
  cobalt: '\x1b[38;5;26m',
  steel:  '\x1b[38;5;67m',
  sky:    '\x1b[38;5;117m',
  ice:    '\x1b[38;5;153m',
  green:  '\x1b[38;5;78m',
  red:    '\x1b[38;5;203m',
  amber:  '\x1b[38;5;221m',
};

const p  = (col, s) => `${col}${s}${_.reset}`;
const W  = s => p(_.white + _.bold, s);
const Si = s => p(_.silver, s);
const Gr = s => p(_.grey, s);
const Sk = s => p(_.sky, s);
const Ic = s => p(_.ice, s);
const St = s => p(_.steel, s);
const G  = s => p(_.green, s);
const R  = s => p(_.red, s);
const Y  = s => p(_.amber, s);
const Co = s => p(_.cobalt, s);

// ── BANNER ────────────────────────────────────────────────────────────────

function banner() {
  console.log('');
  console.log(' ' + Co('███╗   ███╗') + St(' ██████╗ ') + Sk('██████╗ '));
  console.log(' ' + Co('████╗ ████║') + St('██╔════╝ ') + Sk('██╔══██╗'));
  console.log(' ' + Co('██╔████╔██║') + St('██║      ') + Sk('██████╔╝'));
  console.log(' ' + Co('██║╚██╔╝██║') + St('██║      ') + Sk('██╔═══╝ '));
  console.log(' ' + Co('██║ ╚═╝ ██║') + St('╚██████╗ ') + Sk('██║     ') + '  ' + W('─ sync') + '  ' + Gr(`v${VERSION}`));
  console.log(' ' + Co('╚═╝     ╚═╝') + St(' ╚═════╝ ') + Sk('╚═╝     '));
  console.log('');
  console.log('  ' + Si('sync MCP server configs across editors') + '  ' + Gr('· Apache 2.0 · github.com/vektormemory/mcp-sync'));
  console.log('');
}

// ── BOX HELPERS ───────────────────────────────────────────────────────────

const BAR = St('│');
const TL  = St('┌─');
const BL  = St('└');
const HR  = St('─');

function box(label) {
  const raw = label.replace(/\x1b\[[0-9;]*m/g, '');
  console.log('  ' + TL + ' ' + Ic(label) + ' ' + HR.repeat(Math.max(2, 44 - raw.length)));
}
function boxEnd() {
  console.log('  ' + BL + HR.repeat(47));
  console.log('');
}
function row(label, value) {
  const raw = label.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = ' '.repeat(Math.max(1, 20 - raw.length));
  console.log('  ' + BAR + ' ' + label + pad + value);
}
function blank() { console.log('  ' + BAR); }

// ── CLI arg parsing ────────────────────────────────────────────────────────

const [,, cmd, ...args] = process.argv;

function flag(name)    { return args.includes(`--${name}`); }
function opt(name)     { const i = args.indexOf(`--${name}`); return i !== -1 ? args[i + 1] : null; }
function positional(i) { return args.filter(a => !a.startsWith('--'))[i]; }

// ── Helpers ────────────────────────────────────────────────────────────────

function getMcpFile() {
  const f = opt('file') ?? mcpfile.findMcpFile();
  if (!f) {
    console.error('\n  ' + R('✗') + Gr('  No .mcp.json found — run: ') + Sk('mcp-sync init') + '\n');
    process.exit(1);
  }
  return f;
}

function getConnectors() {
  const only = opt('only');
  if (only) {
    const names = only.split(',').map(s => s.trim());
    const bad   = names.filter(n => !CONNECTORS[n]);
    if (bad.length) {
      console.error('\n  ' + R(`✗  Unknown connector(s): ${bad.join(', ')}`));
      console.error('     ' + Gr(`Valid: ${CONNECTOR_NAMES.join(', ')}`) + '\n');
      process.exit(1);
    }
    return Object.fromEntries(names.map(n => [n, CONNECTORS[n]]));
  }
  return CONNECTORS;
}

function existsSilent(p) { try { readFileSync(p); return true; } catch { return false; } }

function shortenPath(p) {
  const home = homedir();
  return p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

// ── Commands ───────────────────────────────────────────────────────────────

function cmdInit() {
  const filePath    = opt('file') ?? resolve(process.cwd(), '.mcp.json');
  const description = opt('description') ?? '';
  const fromEditor  = opt('from');

  try {
    mcpfile.init(filePath, description);
    console.log('\n  ' + G('✓') + Gr('  Created ') + Sk(filePath));
  } catch (err) {
    console.error('\n  ' + R(`✗  ${err.message}`) + '\n');
    process.exit(1);
  }

  if (fromEditor) {
    if (!CONNECTORS[fromEditor]) {
      console.error('\n  ' + R(`✗  Unknown connector: ${fromEditor}`));
      console.error('     ' + Gr(`Valid: ${CONNECTOR_NAMES.join(', ')}`) + '\n');
      process.exit(1);
    }
    try {
      const partial = CONNECTORS[fromEditor].export();
      const base    = mcpfile.read(filePath);
      const merged  = mcpfile.merge(base, partial);
      mcpfile.write(filePath, merged);
      const count   = Object.keys(partial.servers ?? {}).length;
      console.log('  ' + G('✓') + Gr('  Imported ') + W(String(count)) + Gr(' server(s) from ') + Ic(fromEditor));
      if (partial.credentials && Object.keys(partial.credentials).length > 0) {
        console.log('\n  ' + Y('⚠') + Gr(`  ${Object.keys(partial.credentials).length} credential(s) detected — store them:`));
        for (const k of Object.keys(partial.credentials)) {
          console.log('     ' + Gr(`mcp-sync vault set ${k} <value>`));
        }
      }
    } catch (err) {
      console.error('\n  ' + R(`✗  Failed to import from ${fromEditor}: ${err.message}`) + '\n');
      process.exit(1);
    }
  }
  console.log('');
}

function runSync(filePath) {
  const mcp      = mcpfile.read(filePath);
  const resolved = { ...mcp, servers: resolveObject(mcp.servers) };
  const conns    = getConnectors();
  let   anyErr   = false;
  for (const [name, conn] of Object.entries(conns)) {
    // Suppress internal connector logs — the CLI owns all output
    const noop = () => {};
    const origLog = console.log; const origWarn = console.warn;
    console.log = noop; console.warn = noop;
    let result;
    try {
      result = conn.sync(resolved);
    } catch (err) {
      console.log = origLog; console.warn = origWarn;
      console.error('  ' + R('✗') + '  ' + W(name.padEnd(16)) + R(err.message));
      anyErr = true;
      continue;
    }
    console.log = origLog; console.warn = origWarn;
    const count = result.count ?? result.synced ?? '?';
    const dest  = result.written ?? conn.configPath?.() ?? '';
    console.log('  ' + G('✓') + '  ' + W(name.padEnd(16)) + Si(String(count).padStart(2)) + Gr(' server(s) → ') + Sk(shortenPath(dest)));
  }
  mcpfile.write(filePath, mcp);
  return anyErr;
}

function cmdSync() {
  const filePath = getMcpFile();
  banner();
  console.log('  ' + Gr('Syncing') + '  ' + Sk(filePath) + '\n');
  const anyErr = runSync(filePath);

  if (flag('watch')) {
    console.log('\n  ' + St('◈') + Gr('  watching for changes — Ctrl-C to stop\n'));
    let debounce = null;
    watch(filePath, () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        console.log('\n  ' + Ic('↻') + Gr('  change detected — syncing…\n'));
        runSync(filePath);
      }, 200);
    });
    return;
  }

  console.log('');
  if (anyErr) process.exit(1);
}

function cmdExport() {
  const filePath = getMcpFile();
  banner();
  console.log('  ' + Gr('Exporting to') + '  ' + Sk(filePath) + '\n');
  const existing = existsSilent(filePath) ? mcpfile.read(filePath) : { mcpSync: { version: '1.0' }, servers: {} };
  const conns    = getConnectors();
  let   merged   = existing;
  for (const [name, conn] of Object.entries(conns)) {
    try {
      const partial = conn.export();
      const count   = Object.keys(partial.servers ?? {}).length;
      merged = mcpfile.merge(merged, partial);
      console.log('  ' + G('✓') + '  ' + W(name.padEnd(16)) + Si(String(count).padStart(2)) + Gr(' server(s) exported'));
    } catch (err) {
      console.error('  ' + R('✗') + '  ' + W(name.padEnd(16)) + R(err.message));
    }
  }
  mcpfile.write(filePath, merged);
  console.log('\n  ' + G('✓') + Gr('  Saved → ') + Sk(filePath) + '\n');
}

function cmdStatus() {
  banner();
  const conns = getConnectors();

  const CONN_LABELS = {
    claudeDesktop: 'Claude Desktop',
    cursor:        'Cursor',
    vscode:        'VS Code',
    windsurf:      'Windsurf',
    claudeCode:    'Claude Code',
    cline:         'Cline',
    rooCode:       'Roo Code',
  };

  box('CONNECTORS');
  for (const [name, conn] of Object.entries(conns)) {
    try {
      let s = conn.status();
      if (Array.isArray(s)) {
        const path = conn.configPath?.() ?? '';
        s = { installed: existsSync(path), path, servers: s };
      }
      const label = CONN_LABELS[name] ?? name;
      const n     = s.servers?.length ?? 0;
      if (s.installed) {
        const countStr = n === 0 ? Gr('no servers') : G(String(n)) + Gr(` server${n !== 1 ? 's' : ''}`);
        row(G('✓') + ' ' + W(label), countStr);
        console.log('  ' + BAR + '   ' + Gr(shortenPath(s.path)));
        if (n) console.log('  ' + BAR + '   ' + Si(s.servers.join('  ' + Gr('·') + '  ')));
      } else {
        row(Gr('·') + ' ' + Si(label), Gr('not installed'));
        console.log('  ' + BAR + '   ' + Gr(shortenPath(s.path)));
      }
    } catch (err) {
      row(R('✗') + ' ' + W(name), R(err.message));
    }
  }
  boxEnd();
}

function cmdDiff() {
  const filePath = getMcpFile();
  banner();
  console.log('  ' + Gr('Diffing against') + '  ' + Sk(filePath) + '\n');
  const mcp     = mcpfile.read(filePath);
  const conns   = getConnectors();
  let   anyDiff = false;
  for (const [name, conn] of Object.entries(conns)) {
    try {
      const current = conn.export();
      const diff    = mcpfile.diffServers(current, mcp);
      if (!diff.added.length && !diff.removed.length && !diff.changed.length) {
        console.log('  ' + G('✓') + '  ' + W(name.padEnd(16)) + Gr('in sync'));
      } else {
        anyDiff = true;
        console.log('  ' + Y('≠') + '  ' + W(name));
        if (diff.added.length)   console.log('      ' + G('+') + '  ' + Si(diff.added.join(', ')));
        if (diff.removed.length) console.log('      ' + R('-') + '  ' + Si(diff.removed.join(', ')));
        if (diff.changed.length) console.log('      ' + Y('~') + '  ' + Si(diff.changed.join(', ')));
      }
    } catch (err) {
      console.error('  ' + R('✗') + '  ' + W(name.padEnd(16)) + R(err.message));
    }
  }
  console.log('');
  if (anyDiff) process.exit(1);
}

function cmdVault() {
  const sub = positional(0);
  if (sub === 'set') {
    const name  = positional(1);
    const rest  = args.filter(a => !a.startsWith('--'));
    const value = rest.slice(2).join(' ');
    if (!name || !value) {
      console.error('\n  ' + R('✗') + Gr('  Usage: mcp-sync vault set <name> <value>') + '\n');
      process.exit(1);
    }
    vault.set(name, value);
    console.log('\n  ' + G('✓') + Gr('  vault: stored ') + Ic(`"${name}"`) + '\n');
  } else if (sub === 'get') {
    const name = positional(1);
    if (!name) { console.error('\n  ' + R('✗') + Gr('  Usage: mcp-sync vault get <name>') + '\n'); process.exit(1); }
    const val = vault.get(name);
    if (val === null) { console.error('\n  ' + R(`✗  vault: no entry for "${name}"`) + '\n'); process.exit(1); }
    console.log(val);
  } else if (sub === 'delete') {
    const name = positional(1);
    if (!name) { console.error('\n  ' + R('✗') + Gr('  Usage: mcp-sync vault delete <name>') + '\n'); process.exit(1); }
    vault.remove(name);
    console.log('\n  ' + G('✓') + Gr('  vault: deleted ') + Ic(`"${name}"`) + '\n');
  } else if (sub === 'list') {
    const keys = vault.list();
    if (!keys.length) {
      console.log('\n  ' + Gr('vault is empty\n'));
    } else {
      console.log('');
      keys.forEach(k => console.log('  ' + St('·') + '  ' + Si(k)));
      console.log('');
    }
  } else {
    console.error('\n  ' + R('✗') + Gr('  Usage: mcp-sync vault <set|get|delete|list> [name] [value]') + '\n');
    process.exit(1);
  }
}

function cmdHelp() {
  banner();

  box('COMMANDS');
  row(W('init'),   Sk('mcp-sync init') +   Gr('                 create .mcp.json in cwd'));
  row(W('sync'),   Sk('mcp-sync sync') +   Gr('                 push .mcp.json → all editors'));
  row(W('export'), Sk('mcp-sync export') + Gr('               pull editors → .mcp.json'));
  row(W('status'), Sk('mcp-sync status') + Gr('               show installed editors & server counts'));
  row(W('diff'),   Sk('mcp-sync diff') +   Gr('                 show drift vs .mcp.json (CI-friendly)'));
  row(W('vault'),  Sk('mcp-sync vault') +  Gr(' set/get/delete/list  manage encrypted secrets'));
  boxEnd();

  box('OPTIONS');
  row(Sk('--file') +        Gr(' <path>'),      Si('path to .mcp.json') + Gr('  (default: walk up from cwd)'));
  row(Sk('--only') +        Gr(' <name,...>'),  Si('limit to specific connector(s)'));
  row(Sk('--from') +        Gr(' <connector>'), Si('init: seed .mcp.json from an existing editor'));
  row(Sk('--watch'),                             Si('sync: re-sync whenever .mcp.json changes'));
  row(Sk('--description') + Gr(' <text>'),      Si('init: set a description field'));
  boxEnd();

  box('CONNECTORS');
  const desc = {
    claudeDesktop: 'Claude Desktop app',
    cursor:        'Cursor editor',
    vscode:        'VS Code  (.vscode/mcp.json)',
    windsurf:      'Windsurf by Codeium',
    claudeCode:    'Claude Code CLI',
    cline:         'Cline  (VS Code ext · saoudrizwan.claude-dev)',
    rooCode:       'Roo Code  (VS Code ext · rooveterinaryinc.roo-cline)',
  };
  for (const name of CONNECTOR_NAMES) {
    row(G('✓') + ' ' + W(name), Si(desc[name] ?? ''));
  }
  boxEnd();

  box('EXAMPLES');
  blank();
  console.log('  ' + BAR + '  ' + Gr('# Bootstrap from your Cursor config'));
  console.log('  ' + BAR + '  ' + Sk('mcp-sync init --from cursor'));
  blank();
  console.log('  ' + BAR + '  ' + Gr('# Push to all editors'));
  console.log('  ' + BAR + '  ' + Sk('mcp-sync sync'));
  blank();
  console.log('  ' + BAR + '  ' + Gr('# Auto-sync on .mcp.json save'));
  console.log('  ' + BAR + '  ' + Sk('mcp-sync sync --watch'));
  blank();
  console.log('  ' + BAR + '  ' + Gr('# Sync to Cline and Roo Code only'));
  console.log('  ' + BAR + '  ' + Sk('mcp-sync sync --only cline,rooCode'));
  blank();
  console.log('  ' + BAR + '  ' + Gr('# Store a vault secret'));
  console.log('  ' + BAR + '  ' + Sk('mcp-sync vault set my-api-key sk-...'));
  blank();
  boxEnd();
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
    banner();
    console.error('  ' + R(`✗  Unknown command: ${cmd ?? '(none)'}`) + '  ' + Gr('· run mcp-sync help') + '\n');
    process.exit(1);
}
