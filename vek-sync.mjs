#!/usr/bin/env node
/**
 * vek-sync v0.3.0 — CLI entry point
 * Commands: init, sync, export, status, diff, add, ping, share, profile, search, vault
 */

import { readFileSync, watch, existsSync, writeFileSync } from 'fs';
import { resolve, join }                                   from 'path';
import { homedir }                                         from 'os';
import { createInterface }                                 from 'readline/promises';
import * as mcpfile                                        from './utils/mcpfile.js';
import * as vault                                          from './utils/vault.js';
import { backup }                                          from './utils/backup.js';
import { pingStdio, pingHttp }                             from './utils/ping.js';
import { searchCurated, searchNpm }                        from './utils/registry.js';
import {
  claudeDesktop, cursor, vscode, windsurf, claudeCode,
  cline, rooCode, gemini, copilot, continue_, codex,
} from './connectors/index.js';
import { resolveObject } from './utils/vault.js';

const CONNECTORS = {
  claudeDesktop, cursor, vscode, windsurf, claudeCode,
  cline, rooCode, gemini, copilot, continue: continue_, codex,
};
const CONNECTOR_NAMES = Object.keys(CONNECTORS);
const VERSION         = '0.3.0';

// ── PALETTE ───────────────────────────────────────────────────────────────

const _ = {
  reset:  '\x1b[0m',  bold:   '\x1b[1m',
  white:  '\x1b[97m', silver: '\x1b[37m', grey:   '\x1b[90m',
  cobalt: '\x1b[38;5;26m',  steel: '\x1b[38;5;67m',
  sky:    '\x1b[38;5;117m', ice:   '\x1b[38;5;153m',
  green:  '\x1b[38;5;78m',  red:   '\x1b[38;5;203m', amber: '\x1b[38;5;221m',
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
  console.log(' ' + Co('██╗   ██╗') + St(' ███████╗') + Sk(' ██╗  ██╗'));
  console.log(' ' + Co('██║   ██║') + St(' ██╔════╝') + Sk(' ██║ ██╔╝'));
  console.log(' ' + Co('██║   ██║') + St(' █████╗  ') + Sk(' █████╔╝ '));
  console.log(' ' + Co('╚██╗ ██╔╝') + St(' ██╔══╝  ') + Sk(' ██╔═██╗ '));
  console.log(' ' + Co(' ╚████╔╝ ') + St(' ███████╗') + Sk(' ██║  ██╗') + '  ' + W('─ sync') + '  ' + Gr(`v${VERSION}`));
  console.log(' ' + Co('  ╚═══╝  ') + St(' ╚══════╝') + Sk(' ╚═╝  ╚═╝'));
  console.log('');
  console.log('  ' + Si('sync MCP server configs across editors') + '  ' + Gr('· Apache 2.0 · github.com/Vektor-Memory/vek-sync'));
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
function boxEnd() { console.log('  ' + BL + HR.repeat(47)); console.log(''); }
function row(label, value) {
  const raw = label.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = ' '.repeat(Math.max(1, 20 - raw.length));
  console.log('  ' + BAR + ' ' + label + pad + value);
}
function blank() { console.log('  ' + BAR); }

// ── CLI ARG PARSING ───────────────────────────────────────────────────────

const [,, cmd, ...args] = process.argv;

function flag(name)    { return args.includes(`--${name}`); }
function opt(name)     { const i = args.indexOf(`--${name}`); return i !== -1 ? args[i + 1] : null; }
function positional(i) { return args.filter(a => !a.startsWith('--'))[i]; }

// ── HELPERS ───────────────────────────────────────────────────────────────

function getMcpFile() {
  const f = opt('file') ?? mcpfile.findMcpFile();
  if (!f) { console.error('\n  ' + R('✗') + Gr('  No .mcp.json found — run: ') + Sk('vek-sync init') + '\n'); process.exit(1); }
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

const CONN_LABELS = {
  claudeDesktop: 'Claude Desktop',
  cursor:        'Cursor',
  vscode:        'VS Code',
  windsurf:      'Windsurf',
  claudeCode:    'Claude Code',
  cline:         'Cline',
  rooCode:       'Roo Code',
  gemini:        'Gemini CLI',
  copilot:       'GitHub Copilot CLI',
  continue:      'Continue',
  codex:         'Codex (OpenAI)',
};

// ── COMMANDS ──────────────────────────────────────────────────────────────

async function cmdInit() {
  const filePath    = opt('file') ?? resolve(process.cwd(), '.mcp.json');
  const description = opt('description') ?? '';
  const fromEditor  = opt('from');
  const fromUrl     = opt('from-url');

  try {
    mcpfile.init(filePath, description);
    console.log('\n  ' + G('✓') + Gr('  Created ') + Sk(filePath));
  } catch (err) {
    console.error('\n  ' + R(`✗  ${err.message}`) + '\n'); process.exit(1);
  }

  if (fromEditor) {
    if (!CONNECTORS[fromEditor]) {
      console.error('\n  ' + R(`✗  Unknown connector: ${fromEditor}`) + '\n  ' + Gr(`Valid: ${CONNECTOR_NAMES.join(', ')}`) + '\n');
      process.exit(1);
    }
    try {
      const partial = CONNECTORS[fromEditor].export();
      const base    = mcpfile.read(filePath);
      mcpfile.write(filePath, mcpfile.merge(base, partial));
      console.log('  ' + G('✓') + Gr('  Imported ') + W(String(Object.keys(partial.servers ?? {}).length)) + Gr(' server(s) from ') + Ic(fromEditor));
      if (partial.credentials && Object.keys(partial.credentials).length) {
        console.log('\n  ' + Y('⚠') + Gr(`  ${Object.keys(partial.credentials).length} credential(s) detected — store them:`));
        for (const k of Object.keys(partial.credentials)) console.log('     ' + Gr(`vek-sync vault set ${k} <value>`));
      }
    } catch (err) {
      console.error('\n  ' + R(`✗  Failed to import from ${fromEditor}: ${err.message}`) + '\n'); process.exit(1);
    }
  }

  if (fromUrl) {
    try {
      console.log('  ' + Gr('Fetching ') + Sk(fromUrl) + Gr('…'));
      const res     = await fetch(fromUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text    = await res.text();
      const remote  = JSON.parse(text);
      const base    = mcpfile.read(filePath);
      mcpfile.write(filePath, mcpfile.merge(base, remote));
      console.log('  ' + G('✓') + Gr('  Imported ') + W(String(Object.keys(remote.servers ?? {}).length)) + Gr(' server(s) from URL'));
    } catch (err) {
      console.error('\n  ' + R(`✗  Failed to import from URL: ${err.message}`) + '\n'); process.exit(1);
    }
  }

  console.log('');
}

function runSync(filePath, dryRun = false) {
  const mcp      = mcpfile.read(filePath);
  const resolved = { ...mcp, servers: resolveObject(mcp.servers) };
  const conns    = getConnectors();
  let   anyErr   = false;

  for (const [name, conn] of Object.entries(conns)) {
    if (dryRun) {
      // Show what would change without writing
      try {
        const noop = () => {}; const ol = console.log; const ow = console.warn;
        console.log = noop; console.warn = noop;
        const current = conn.export?.() ?? { servers: {} };
        console.log = ol; console.warn = ow;
        const diff = mcpfile.diffServers(current, mcp);
        const label = CONN_LABELS[name] ?? name;
        if (!diff.added.length && !diff.removed.length && !diff.changed.length) {
          console.log('  ' + G('✓') + '  ' + W((label).padEnd(18)) + Gr('in sync'));
        } else {
          console.log('  ' + Y('≠') + '  ' + W(label));
          if (diff.added.length)   console.log('      ' + G('+') + '  ' + Si(diff.added.join(', ')));
          if (diff.removed.length) console.log('      ' + R('-') + '  ' + Si(diff.removed.join(', ')));
          if (diff.changed.length) console.log('      ' + Y('~') + '  ' + Si(diff.changed.join(', ')));
        }
      } catch { /* connector may not support export */ }
      continue;
    }

    // Backup the target config before overwriting
    const cfgPath = conn.configPath?.();
    if (cfgPath) backup(cfgPath);

    const noop = () => {}; const origLog = console.log; const origWarn = console.warn;
    console.log = noop; console.warn = noop;
    let result;
    try {
      result = conn.sync(resolved);
    } catch (err) {
      console.log = origLog; console.warn = origWarn;
      console.error('  ' + R('✗') + '  ' + W((CONN_LABELS[name] ?? name).padEnd(18)) + R(err.message));
      anyErr = true; continue;
    }
    console.log = origLog; console.warn = origWarn;
    const count = result.count ?? result.synced ?? '?';
    const dest  = result.written ?? cfgPath ?? '';
    console.log('  ' + G('✓') + '  ' + W((CONN_LABELS[name] ?? name).padEnd(18)) + Si(String(count).padStart(2)) + Gr(' server(s) → ') + Sk(shortenPath(dest)));
  }

  if (!dryRun) mcpfile.write(filePath, mcp);
  return anyErr;
}

function cmdSync() {
  const filePath = getMcpFile();
  const dryRun   = flag('dry-run');
  banner();
  if (dryRun) {
    console.log('  ' + Y('◌') + Gr('  Dry run — no files will be written\n'));
  } else {
    console.log('  ' + Gr('Syncing') + '  ' + Sk(filePath) + '\n');
  }
  const anyErr = runSync(filePath, dryRun);

  if (!dryRun && flag('watch')) {
    console.log('\n  ' + St('◈') + Gr('  watching for changes — Ctrl-C to stop\n'));
    let debounce = null;
    watch(filePath, () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        console.log('\n  ' + Ic('↻') + Gr('  change detected — syncing…\n'));
        runSync(filePath, false);
      }, 200);
    });
    return;
  }
  console.log('');
  if (!dryRun && anyErr) process.exit(1);
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
      merged = mcpfile.merge(merged, partial);
      console.log('  ' + G('✓') + '  ' + W((CONN_LABELS[name] ?? name).padEnd(18)) + Si(String(Object.keys(partial.servers ?? {}).length).padStart(2)) + Gr(' server(s) exported'));
    } catch (err) {
      console.error('  ' + R('✗') + '  ' + W((CONN_LABELS[name] ?? name).padEnd(18)) + R(err.message));
    }
  }
  mcpfile.write(filePath, merged);
  console.log('\n  ' + G('✓') + Gr('  Saved → ') + Sk(filePath) + '\n');
}

function cmdStatus() {
  banner();
  box('CONNECTORS');
  for (const [name, conn] of Object.entries(getConnectors())) {
    try {
      let s = conn.status();
      if (Array.isArray(s)) {
        const path = conn.configPath?.() ?? '';
        s = { installed: existsSync(path), path, servers: s };
      }
      const label = CONN_LABELS[name] ?? name;
      const n     = s.servers?.length ?? 0;
      if (s.installed) {
        row(G('✓') + ' ' + W(label), n === 0 ? Gr('no servers') : G(String(n)) + Gr(` server${n !== 1 ? 's' : ''}`));
        console.log('  ' + BAR + '   ' + Gr(shortenPath(s.path)));
        if (n) console.log('  ' + BAR + '   ' + Si(s.servers.join('  ' + Gr('·') + '  ')));
      } else {
        row(Gr('·') + ' ' + Si(label), Gr('not installed'));
        console.log('  ' + BAR + '   ' + Gr(shortenPath(s.path)));
      }
    } catch (err) { row(R('✗') + ' ' + W(name), R(err.message)); }
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
      const noop = () => {}; const ol = console.log; const ow = console.warn;
      console.log = noop; console.warn = noop;
      const current = conn.export();
      console.log = ol; console.warn = ow;
      const diff = mcpfile.diffServers(current, mcp);
      if (!diff.added.length && !diff.removed.length && !diff.changed.length) {
        console.log('  ' + G('✓') + '  ' + W((CONN_LABELS[name] ?? name).padEnd(18)) + Gr('in sync'));
      } else {
        anyDiff = true;
        console.log('  ' + Y('≠') + '  ' + W(CONN_LABELS[name] ?? name));
        if (diff.added.length)   console.log('      ' + G('+') + '  ' + Si(diff.added.join(', ')));
        if (diff.removed.length) console.log('      ' + R('-') + '  ' + Si(diff.removed.join(', ')));
        if (diff.changed.length) console.log('      ' + Y('~') + '  ' + Si(diff.changed.join(', ')));
      }
    } catch (err) { console.error('  ' + R('✗') + '  ' + W(name) + '  ' + R(err.message)); }
  }
  console.log('');
  if (anyDiff) process.exit(1);
}

// ── ADD ───────────────────────────────────────────────────────────────────

async function cmdAdd() {
  const filePath = getMcpFile();
  banner();
  box('ADD SERVER');

  const rl      = createInterface({ input: process.stdin, output: process.stdout });
  const ask     = async (q, def = '') => {
    const ans = (await rl.question('  ' + BAR + '  ' + Si(q) + (def ? Gr(` [${def}]`) : '') + ' ')).trim();
    return ans || def;
  };

  try {
    const name      = await ask('Server name:');
    if (!name) { console.log('\n  ' + R('✗  Name is required') + '\n'); rl.close(); return; }

    const transport = await ask('Transport (stdio/http):', 'stdio');
    let   def       = {};

    if (transport === 'http') {
      const url     = await ask('URL:');
      const hdrRaw  = await ask('Headers (KEY=value space-separated, or blank):');
      def.url = url;
      if (hdrRaw) {
        def.headers = {};
        for (const pair of hdrRaw.split(/\s+/)) {
          const [k, ...v] = pair.split('=');
          if (k) def.headers[k] = v.join('=');
        }
      }
    } else {
      const command = await ask('Command:', 'npx');
      const argsRaw = await ask('Args (space-separated):');
      const envRaw  = await ask('Env vars (KEY=value space-separated, or blank):');
      def.command = command;
      def.args    = argsRaw ? argsRaw.split(/\s+/) : [];
      if (envRaw) {
        def.env = {};
        for (const pair of envRaw.split(/\s+/)) {
          const [k, ...v] = pair.split('=');
          if (k) def.env[k] = v.join('=');
        }
      }
    }

    rl.close();
    blank(); boxEnd();

    const mcp = mcpfile.read(filePath);
    if (mcp.servers[name]) {
      console.log('  ' + Y('⚠') + Gr(`  Overwriting existing server "${name}"`));
    }
    mcp.servers[name] = def;
    mcpfile.write(filePath, mcp);
    console.log('  ' + G('✓') + Gr('  Added ') + W(`"${name}"`) + Gr(' to ') + Sk(filePath));
    console.log('  ' + Gr('  Run ') + Sk('vek-sync sync') + Gr(' to push to all editors\n'));
  } catch (err) {
    rl.close();
    console.error('\n  ' + R(`✗  ${err.message}`) + '\n'); process.exit(1);
  }
}

// ── PING ──────────────────────────────────────────────────────────────────

async function cmdPing() {
  const filePath = getMcpFile();
  const mcp      = mcpfile.read(filePath);
  const resolved = resolveObject(mcp.servers ?? {});
  banner();
  box('PING');

  const entries = Object.entries(resolved);
  if (!entries.length) {
    console.log('  ' + BAR + '  ' + Gr('No servers in .mcp.json'));
    boxEnd(); return;
  }

  for (const [name, def] of entries) {
    const label = name.padEnd(22);
    if (def.url) {
      const r = await pingHttp(def.url);
      const ms = r.ms != null ? Gr(` ${r.ms}ms`) : '';
      console.log('  ' + BAR + '  ' + (r.ok ? G('✓') : R('✗')) + '  ' + Si(label) + (r.ok ? G('alive') + ms + Gr(' (http)') : R(r.error ?? 'unreachable')));
    } else if (def.command) {
      const r = await pingStdio(def.command, def.args ?? [], def.env ?? {});
      const ms = r.ms != null ? Gr(` ${r.ms}ms`) : '';
      const note = r.note ? Gr(`  ${r.note}`) : '';
      console.log('  ' + BAR + '  ' + (r.ok ? G('✓') : R('✗')) + '  ' + Si(label) + (r.ok ? G('alive') + ms + note : R(r.error ?? 'failed')));
    } else {
      console.log('  ' + BAR + '  ' + Y('?') + '  ' + Si(label) + Gr('unknown transport'));
    }
  }
  boxEnd();
}

// ── SHARE ─────────────────────────────────────────────────────────────────

async function cmdShare() {
  const filePath = getMcpFile();
  const mcp      = mcpfile.read(filePath);
  banner();

  // Strip vault: refs from servers — don't publish secret pointers
  const safe = {
    ...mcp,
    servers: Object.fromEntries(
      Object.entries(mcp.servers ?? {}).map(([name, def]) => [
        name,
        {
          ...def,
          env:     def.env     ? Object.fromEntries(Object.entries(def.env).map(([k, v]) => [k, v.startsWith('vault:') ? 'vault:<redacted>' : v])) : undefined,
          headers: def.headers ? Object.fromEntries(Object.entries(def.headers).map(([k, v]) => [k, v.startsWith('vault:') ? 'vault:<redacted>' : v])) : undefined,
        },
      ])
    ),
  };
  const content = JSON.stringify(safe, null, 2);

  console.log('  ' + Gr('Uploading config (secrets redacted)…\n'));

  try {
    const res = await fetch('https://paste.rs/', {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain', 'User-Agent': 'vek-sync/0.3.0' },
      body:    content,
    });
    if (!res.ok) throw new Error(`paste.rs HTTP ${res.status}`);
    const url = (await res.text()).trim();
    console.log('  ' + G('✓') + Gr('  Shared → ') + Sk(url));
    console.log('  ' + Gr('  Import with: ') + Sk(`vek-sync init --from-url ${url}`) + '\n');
  } catch (err) {
    console.error('  ' + R(`✗  Share failed: ${err.message}`));
    console.log('\n  ' + Gr('Config to share manually:\n'));
    console.log(content + '\n');
  }
}

// ── PROFILE ───────────────────────────────────────────────────────────────

function cmdProfile() {
  const sub = positional(0);
  const filePath = getMcpFile();
  const mcp      = mcpfile.read(filePath);
  const profiles = mcp.profiles ?? {};

  if (sub === 'save') {
    const name = positional(1);
    if (!name) { console.error('\n  ' + R('✗  Usage: vek-sync profile save <name>') + '\n'); process.exit(1); }
    mcp.profiles = { ...profiles, [name]: { servers: { ...mcp.servers } } };
    mcpfile.write(filePath, mcp);
    console.log('\n  ' + G('✓') + Gr(`  Profile "${name}" saved (`) + W(String(Object.keys(mcp.servers).length)) + Gr(' servers)\n'));

  } else if (sub === 'use') {
    const name = positional(1);
    if (!name) { console.error('\n  ' + R('✗  Usage: vek-sync profile use <name>') + '\n'); process.exit(1); }
    if (!profiles[name]) {
      console.error('\n  ' + R(`✗  Profile "${name}" not found`));
      console.error('     ' + Gr(`Available: ${Object.keys(profiles).join(', ') || '(none)'}`) + '\n');
      process.exit(1);
    }
    mcp.servers = { ...profiles[name].servers };
    mcp.mcpSync = { ...mcp.mcpSync, activeProfile: name };
    mcpfile.write(filePath, mcp);
    console.log('\n  ' + G('✓') + Gr(`  Switched to profile `) + W(`"${name}"`) + Gr(` (${Object.keys(mcp.servers).length} servers)`));
    console.log('  ' + Gr('  Run ') + Sk('vek-sync sync') + Gr(' to push to editors\n'));

  } else if (sub === 'list') {
    banner();
    box('PROFILES');
    const active = mcp.mcpSync?.activeProfile;
    if (!Object.keys(profiles).length) {
      console.log('  ' + BAR + '  ' + Gr('No profiles saved yet. Use: vek-sync profile save <name>'));
    } else {
      for (const [name, prof] of Object.entries(profiles)) {
        const isActive = name === active;
        row(
          (isActive ? G('●') : Gr('○')) + ' ' + W(name),
          Si(String(Object.keys(prof.servers ?? {}).length)) + Gr(' servers') + (isActive ? '  ' + G('← active') : '')
        );
      }
    }
    boxEnd();

  } else if (sub === 'delete') {
    const name = positional(1);
    if (!name) { console.error('\n  ' + R('✗  Usage: vek-sync profile delete <name>') + '\n'); process.exit(1); }
    if (!profiles[name]) { console.error('\n  ' + R(`✗  Profile "${name}" not found`) + '\n'); process.exit(1); }
    delete mcp.profiles[name];
    mcpfile.write(filePath, mcp);
    console.log('\n  ' + G('✓') + Gr(`  Deleted profile "${name}"\n`));

  } else {
    console.error('\n  ' + R('✗  Usage: vek-sync profile <save|use|list|delete> [name]') + '\n');
    process.exit(1);
  }
}

// ── SEARCH ────────────────────────────────────────────────────────────────

async function cmdSearch() {
  const query = positional(0);
  banner();

  if (!query) {
    console.error('  ' + R('✗  Usage: vek-sync search <query>') + '\n'); process.exit(1);
  }

  box(`SEARCH  "${query}"`);

  const curated = searchCurated(query);
  if (curated.length) {
    for (const s of curated) {
      row(G('★') + ' ' + W(s.name), Si(s.package));
      console.log('  ' + BAR + '   ' + Gr(s.description));
      console.log('  ' + BAR + '   ' + Sk(`npx -y ${s.package}`));
      blank();
    }
  }

  console.log('  ' + BAR + '  ' + Gr('Searching npm…'));
  const npm = (await searchNpm(query)).filter(r => !curated.find(c => c.package === r.package));
  for (const s of npm.slice(0, 5)) {
    row(Gr('·') + ' ' + Si(s.name), Gr(s.package));
    if (s.description) console.log('  ' + BAR + '   ' + Gr(s.description));
    blank();
  }

  if (!curated.length && !npm.length) {
    console.log('  ' + BAR + '  ' + Y('No results found'));
  }

  boxEnd();

  // Offer to add one
  if (curated.length) {
    const rl  = createInterface({ input: process.stdin, output: process.stdout });
    const ans = (await rl.question('  Add to .mcp.json? Enter name or blank to skip: ')).trim();
    rl.close();
    if (ans) {
      const found = curated.find(s => s.name === ans) ?? npm.find(s => s.name === ans);
      if (found) {
        try {
          const filePath = getMcpFile();
          const mcp = mcpfile.read(filePath);
          mcp.servers[found.name] = {
            command: found.command,
            args:    found.args,
            ...(found.env ? { env: found.env } : {}),
          };
          mcpfile.write(filePath, mcp);
          console.log('\n  ' + G('✓') + Gr('  Added ') + W(`"${found.name}"`) + Gr(' — run ') + Sk('vek-sync sync') + Gr(' to push\n'));
        } catch (err) {
          console.error('\n  ' + R(`✗  ${err.message}`) + '\n');
        }
      } else {
        console.log('\n  ' + Y('⚠') + Gr(`  "${ans}" not found in results — use `) + Sk('vek-sync add') + Gr(' to add manually\n'));
      }
    }
  }
}

// ── VAULT ─────────────────────────────────────────────────────────────────

function cmdVault() {
  const sub = positional(0);
  if (sub === 'set') {
    const name  = positional(1);
    const rest  = args.filter(a => !a.startsWith('--'));
    const value = rest.slice(2).join(' ');
    if (!name || !value) { console.error('\n  ' + R('✗') + Gr('  Usage: vek-sync vault set <name> <value>') + '\n'); process.exit(1); }
    vault.set(name, value);
    console.log('\n  ' + G('✓') + Gr('  vault: stored ') + Ic(`"${name}"`) + '\n');
  } else if (sub === 'get') {
    const name = positional(1);
    if (!name) { console.error('\n  ' + R('✗') + Gr('  Usage: vek-sync vault get <name>') + '\n'); process.exit(1); }
    const val = vault.get(name);
    if (val === null) { console.error('\n  ' + R(`✗  vault: no entry for "${name}"`) + '\n'); process.exit(1); }
    console.log(val);
  } else if (sub === 'delete') {
    const name = positional(1);
    if (!name) { console.error('\n  ' + R('✗') + Gr('  Usage: vek-sync vault delete <name>') + '\n'); process.exit(1); }
    vault.remove(name);
    console.log('\n  ' + G('✓') + Gr('  vault: deleted ') + Ic(`"${name}"`) + '\n');
  } else if (sub === 'list') {
    const keys = vault.list();
    if (!keys.length) console.log('\n  ' + Gr('vault is empty\n'));
    else { console.log(''); keys.forEach(k => console.log('  ' + St('·') + '  ' + Si(k))); console.log(''); }
  } else {
    console.error('\n  ' + R('✗') + Gr('  Usage: vek-sync vault <set|get|delete|list> [name] [value]') + '\n'); process.exit(1);
  }
}

// ── HELP ──────────────────────────────────────────────────────────────────

function cmdHelp() {
  banner();

  box('COMMANDS');
  row(W('init'),    Sk('vek-sync init') +    Gr('                 create .mcp.json in cwd'));
  row(W('sync'),    Sk('vek-sync sync') +    Gr('                 push .mcp.json → all editors'));
  row(W('export'),  Sk('vek-sync export') +  Gr('               pull editors → .mcp.json'));
  row(W('status'),  Sk('vek-sync status') +  Gr('               show installed editors & counts'));
  row(W('diff'),    Sk('vek-sync diff') +    Gr('                 drift check (CI-friendly)'));
  row(W('add'),     Sk('vek-sync add') +     Gr('                  interactive server wizard'));
  row(W('ping'),    Sk('vek-sync ping') +    Gr('                 health check all servers'));
  row(W('share'),   Sk('vek-sync share') +   Gr('                publish config to shareable URL'));
  row(W('profile'), Sk('vek-sync profile') + Gr(' save|use|list|delete  named server sets'));
  row(W('search'),  Sk('vek-sync search') +  Gr(' <query>         find MCP servers in registry'));
  row(W('vault'),   Sk('vek-sync vault') +   Gr('  set|get|delete|list  manage secrets'));
  boxEnd();

  box('OPTIONS');
  row(Sk('--file') +        Gr(' <path>'),      Si('path to .mcp.json'));
  row(Sk('--only') +        Gr(' <name,...>'),  Si('limit to specific connector(s)'));
  row(Sk('--from') +        Gr(' <connector>'), Si('init: seed from an editor config'));
  row(Sk('--from-url') +    Gr(' <url>'),       Si('init: seed from a shared URL'));
  row(Sk('--dry-run'),                           Si('sync: preview changes without writing'));
  row(Sk('--watch'),                             Si('sync: re-sync on .mcp.json change'));
  row(Sk('--description') + Gr(' <text>'),      Si('init: description field'));
  boxEnd();

  box('CONNECTORS');
  const desc = {
    claudeDesktop: 'Claude Desktop app',
    cursor:        'Cursor editor',
    vscode:        'VS Code  (.vscode/mcp.json)',
    windsurf:      'Windsurf by Codeium',
    claudeCode:    'Claude Code CLI',
    cline:         'Cline  (saoudrizwan.claude-dev)',
    rooCode:       'Roo Code  (rooveterinaryinc.roo-cline)',
    gemini:        'Gemini CLI',
    copilot:       'GitHub Copilot CLI',
    continue:      'Continue  (continue.continue) — array format',
    codex:         'Codex CLI  — TOML format',
  };
  for (const name of CONNECTOR_NAMES) row(G('✓') + ' ' + W(name), Si(desc[name] ?? ''));
  boxEnd();

  box('EXAMPLES');
  blank();
  console.log('  ' + BAR + '  ' + Gr('# Bootstrap from Cursor, push everywhere'));
  console.log('  ' + BAR + '  ' + Sk('vek-sync init --from cursor && vek-sync sync'));
  blank();
  console.log('  ' + BAR + '  ' + Gr('# Preview what sync would change'));
  console.log('  ' + BAR + '  ' + Sk('vek-sync sync --dry-run'));
  blank();
  console.log('  ' + BAR + '  ' + Gr('# Watch mode — auto-sync on save'));
  console.log('  ' + BAR + '  ' + Sk('vek-sync sync --watch'));
  blank();
  console.log('  ' + BAR + '  ' + Gr('# Find and add a server from the registry'));
  console.log('  ' + BAR + '  ' + Sk('vek-sync search filesystem'));
  blank();
  console.log('  ' + BAR + '  ' + Gr('# Health-check all configured servers'));
  console.log('  ' + BAR + '  ' + Sk('vek-sync ping'));
  blank();
  console.log('  ' + BAR + '  ' + Gr('# Save a named profile, switch later'));
  console.log('  ' + BAR + '  ' + Sk('vek-sync profile save work'));
  console.log('  ' + BAR + '  ' + Sk('vek-sync profile use personal'));
  blank();
  console.log('  ' + BAR + '  ' + Gr('# Share config with a teammate'));
  console.log('  ' + BAR + '  ' + Sk('vek-sync share'));
  blank();
  boxEnd();
}

// ── DISPATCH ──────────────────────────────────────────────────────────────

switch (cmd) {
  case 'init':    await cmdInit();    break;
  case 'sync':          cmdSync();    break;
  case 'export':        cmdExport();  break;
  case 'status':        cmdStatus();  break;
  case 'diff':          cmdDiff();    break;
  case 'add':     await cmdAdd();     break;
  case 'ping':    await cmdPing();    break;
  case 'share':   await cmdShare();   break;
  case 'profile':       cmdProfile(); break;
  case 'search':  await cmdSearch();  break;
  case 'vault':         cmdVault();   break;
  case 'help':
  case '--help':
  case '-h':            cmdHelp();    break;
  default:
    banner();
    console.error('  ' + R(`✗  Unknown command: ${cmd ?? '(none)'}`) + '  ' + Gr('· run vek-sync help') + '\n');
    process.exit(1);
}
