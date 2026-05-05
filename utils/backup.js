/**
 * utils/backup.js
 * Copy an editor config file to ~/.mcp-sync/backups/<timestamp>/ before overwrite.
 */

import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, basename }                       from 'path';
import { homedir }                              from 'os';

const BACKUP_ROOT = join(homedir(), '.mcp-sync', 'backups');

/**
 * Back up a file before it is overwritten by sync.
 * @param {string} filePath  Absolute path to the file to back up.
 * @returns {string|null}    Path of the backup file, or null if source didn't exist.
 */
export function backup(filePath) {
  if (!existsSync(filePath)) return null;
  const dir  = join(BACKUP_ROOT, String(Date.now()));
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, basename(filePath));
  copyFileSync(filePath, dest);
  return dest;
}

/**
 * Path to the backup root directory (for display purposes).
 */
export const backupDir = BACKUP_ROOT;
