#!/usr/bin/env node
'use strict';

/**
 * http_fetch.js v1.0 — Capa de red nativa SÍNCRONA para valorant-analytics.
 *
 * Reemplaza el shell-out a `curl.exe` (binario fantasma + interpolación de shell)
 * por HTTPS nativo de Node.js. Síncrono por diseño para no romper el resto del
 * ecosistema (CLIs y motores dependen de `fetchMatch`/`fetchProfile` síncronos).
 *
 * Implementación: spawn de un hijo `node -e` con https nativo, argumentos por
 * array (cero interpolación de shell → sin vector de inyección), reintento con
 * backoff exponencial ante rate-limit (HTTP 429/403 → exit 29) y timeout (exit 28).
 *
 * Zero dependencias externas. Portable Windows/POSIX.
 */

const { execFileSync } = require('child_process');
const { URL } = require('url');

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CHILD_SCRIPT = [
  "const https=require('https');",
  "const {URL}=require('url');",
  'const url=process.argv[2];',
  "const ua=process.argv[3]||'';",
  'const timeout=parseInt(process.argv[4]||\'12000\',10);',
  "let u; try{ u=new URL(url); }catch(e){ console.error('URL invalida'); process.exit(2); }",
  "const req=https.get(u,{headers:{'User-Agent':ua,'Accept':'application/json'}},res=>{",
  "  const chunks=[];",
  "  res.on('data',c=>chunks.push(c));",
  "  res.on('end',()=>{",
  "    const body=Buffer.concat(chunks).toString('utf8');",
  '    if(res.statusCode===429||res.statusCode===403){ process.exit(29); }',
  '    if(res.statusCode>=400){ console.error("HTTP "+res.statusCode); process.exit(1); }',
  '    process.stdout.write(body);',
  '  });',
  '});',
  'req.setTimeout(timeout,()=>{ req.destroy(); process.exit(28); });',
  "req.on('error',e=>{ console.error(e.message); process.exit(1); });"
].join('');

function httpsGetJson(urlStr, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const timeoutMs = options.timeoutMs || 12000;
  const userAgent = options.userAgent || DEFAULT_UA;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const out = execFileSync(
        process.execPath,
        ['-e', CHILD_SCRIPT, urlStr, userAgent, String(timeoutMs)],
        { encoding: 'utf8', timeout: timeoutMs + 5000, maxBuffer: 30 * 1024 * 1024 }
      );
      return JSON.parse(out);
    } catch (e) {
      const code = typeof e.status === 'number' ? e.status : 0;
      const errLine = String((e.stderr || '').toString().trim().split('\n')[0] || e.message);
      if (code === 28 || code === 29) {
        if (attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 500;
          try {
            execFileSync(process.execPath, ['-e', `setTimeout(()=>{},${backoffMs})`], { stdio: 'ignore' });
          } catch (be) { /* continuar */ }
          continue;
        }
        throw new Error(`${code === 29 ? 'Rate limit / bloqueo Cloudflare' : 'Timeout'} tras ${maxRetries} intentos: ${urlStr}`);
      }
      throw new Error(`Fallo de red (HTTP ${code}): ${errLine || urlStr}`);
    }
  }
  throw new Error(`Fallo de red inesperado: ${urlStr}`);
}

module.exports = { httpsGetJson, DEFAULT_UA };