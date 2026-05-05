/**
 * utils/vault.js
 * AES-256-GCM local credential store for mcp-sync.
 * Credentials live in ~/.mcp-sync/vault.json (encrypted at rest).
 * "vault:key-name" refs are resolved at runtime before writing to connectors.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync }         from 'fs';
import { join }                                                        from 'path';
import { homedir, hostname }                                           from 'os';

const VAULT_DIR  = join(homedir(), '.mcp-sync');
const VAULT_FILE = join(VAULT_DIR, 'vault.json');
const SALT_FILE  = join(VAULT_DIR, '.salt');
const ALG        = 'aes-256-gcm';
const IV_LEN     = 12;
const TAG_LEN    = 16;

function ensureDir() {
  if (!existsSync(VAULT_DIR)) mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
}

function getMachineKey() {
  ensureDir();
  let salt;
  if (existsSync(SALT_FILE)) {
    salt = readFileSync(SALT_FILE, 'utf8').trim();
  } else {
    salt = randomBytes(24).toString('hex');
    writeFileSync(SALT_FILE, salt, { mode: 0o600 });
  }
  const secret = `mcp-sync:${hostname()}:${salt}`;
  return scryptSync(secret, 'mcp-sync-vault', 32, { N: 16384, r: 8, p: 1 });
}

let _key = null;
function key() { return _key ?? (_key = getMachineKey()); }

function encrypt(plaintext) {
  const iv      = randomBytes(IV_LEN);
  const cipher  = createCipheriv(ALG, key(), iv);
  const enc     = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag     = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(b64) {
  const buf  = Buffer.from(b64, 'base64');
  const iv   = buf.slice(0, IV_LEN);
  const tag  = buf.slice(IV_LEN, IV_LEN + TAG_LEN);
  const enc  = buf.slice(IV_LEN + TAG_LEN);
  const dec  = createDecipheriv(ALG, key(), iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(enc), dec.final()]).toString('utf8');
}

function loadRaw() {
  if (!existsSync(VAULT_FILE)) return {};
  try { return JSON.parse(readFileSync(VAULT_FILE, 'utf8')); } catch { return {}; }
}

function saveRaw(data) {
  ensureDir();
  writeFileSync(VAULT_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function set(name, value) {
  if (!name) throw new Error('vault.set: name required');
  const raw = loadRaw();
  raw[name] = encrypt(String(value));
  saveRaw(raw);
}

export function get(name) {
  const raw = loadRaw();
  if (!raw[name]) return null;
  try { return decrypt(raw[name]); }
  catch { throw new Error(`vault: failed to decrypt "${name}" — wrong machine or corrupted vault`); }
}

export function remove(name) {
  const raw = loadRaw();
  delete raw[name];
  saveRaw(raw);
}

export function list() { return Object.keys(loadRaw()); }

export function resolve(str) {
  if (typeof str !== 'string' || !str.startsWith('vault:')) return str;
  const name  = str.slice(6);
  const value = get(name);
  if (value === null) throw new Error(`vault: no entry for "${name}"`);
  return value;
}

export function resolveObject(obj) {
  if (typeof obj === 'string')       return resolve(obj);
  if (Array.isArray(obj))            return obj.map(resolveObject);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = resolveObject(v);
    return out;
  }
  return obj;
}

export function looksLikeSecret(str) {
  if (typeof str !== 'string' || str.startsWith('vault:')) return false;
  return str.length > 12 && /[A-Za-z]/.test(str) && /[0-9]/.test(str) && !/^[a-z0-9_/\\:-]+$/.test(str);
}

export default { set, get, remove, list, resolve, resolveObject, looksLikeSecret };