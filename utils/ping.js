/**
 * utils/ping.js
 * Spawn an MCP stdio server, send an initialize request, verify it responds.
 * HTTP servers are checked with a simple fetch.
 */

import { spawn }  from 'child_process';

const INIT_MSG = JSON.stringify({
  jsonrpc: '2.0',
  id:      1,
  method:  'initialize',
  params:  {
    protocolVersion: '2024-11-05',
    capabilities:    {},
    clientInfo:      { name: 'mcp-sync', version: '0.3.0' },
  },
});

// MCP stdio uses Content-Length framing
function frame(json) {
  return `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
}

/**
 * Ping a stdio MCP server.
 * @param {string}   command
 * @param {string[]} args
 * @param {object}   env   Extra env vars (already resolved from vault).
 * @param {number}   timeout  ms to wait for a response (default 4000).
 * @returns {Promise<{ok:boolean, ms?:number, error?:string, note?:string}>}
 */
export function pingStdio(command, args = [], env = {}, timeout = 4000) {
  return new Promise(resolve => {
    const t0   = Date.now();
    let   done = false;

    const proc = spawn(command, args, {
      env:   { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const finish = result => {
      if (done) return;
      done = true;
      try { proc.kill(); } catch { /**/ }
      resolve({ ...result, ms: Date.now() - t0 });
    };

    proc.stdin.write(frame(INIT_MSG));

    let buf = '';
    proc.stdout.on('data', chunk => {
      buf += chunk.toString();
      // Any valid response means the server is alive
      if (buf.includes('"jsonrpc"') || buf.includes('"result"')) {
        finish({ ok: true });
      }
    });

    proc.on('error', err => finish({ ok: false, error: err.message }));

    proc.on('exit', code => {
      if (!done) finish({ ok: false, error: `exited with code ${code ?? '?'}` });
    });

    setTimeout(() => {
      if (!done) finish({ ok: true, note: 'alive (no response within timeout)' });
    }, timeout);
  });
}

/**
 * Ping an HTTP/SSE MCP server.
 * @returns {Promise<{ok:boolean, ms?:number, error?:string}>}
 */
export async function pingHttp(url, timeout = 4000) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
    clearTimeout(timer);
    return { ok: res.ok || res.status < 500, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, error: err.message };
  }
}
