#!/usr/bin/env node
'use strict';

/**
 * browser_cache_harvester.js - Motor de Cosecha de Telemetría desde Caché Local de Navegadores
 *
 * Resuelve definitivamente el bloqueo de Cloudflare WAF (HTTP 403 / Turnstile) extrayendo
 * de forma directa y determinista los payloads ya autenticados y recibidos en navegadores
 * Chromium (Vivaldi, Brave, Google Chrome, Microsoft Edge, Opera).
 *
 * Capacidades:
 * 1. Detección multi-plataforma de directorios de caché Chromium (Windows, Linux, macOS).
 * 2. Parseo de índices blockfile (data_1) y resolución de direcciones (data_2, data_3, f_*).
 * 3. Descompresión nativa de streams Brotli y Gzip.
 * 4. Extracción selectiva por Riot ID o UUID de partida.
 * 5. Cero dependencias externas (Node.js core: fs, path, os, zlib).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

function getChromiumCachePaths() {
  const isWindows = process.platform === 'win32';
  const home = os.homedir();
  const paths = [];

  if (isWindows) {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');

    paths.push(
      path.join(local, 'Vivaldi', 'User Data', 'Default', 'Cache', 'Cache_Data'),
      path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Cache', 'Cache_Data'),
      path.join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Cache', 'Cache_Data'),
      path.join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache', 'Cache_Data'),
      path.join(roaming, 'Opera Software', 'Opera Stable', 'Cache', 'Cache_Data')
    );
  } else if (process.platform === 'darwin') {
    paths.push(
      path.join(home, 'Library', 'Caches', 'Vivaldi', 'Default', 'Cache', 'Cache_Data'),
      path.join(home, 'Library', 'Caches', 'BraveSoftware', 'Brave-Browser', 'Default', 'Cache', 'Cache_Data'),
      path.join(home, 'Library', 'Caches', 'Google', 'Chrome', 'Default', 'Cache', 'Cache_Data'),
      path.join(home, 'Library', 'Caches', 'Microsoft Edge', 'Default', 'Cache', 'Cache_Data')
    );
  } else {
    // Linux
    paths.push(
      path.join(home, '.cache', 'vivaldi', 'Default', 'Cache', 'Cache_Data'),
      path.join(home, '.cache', 'brave', 'Default', 'Cache', 'Cache_Data'),
      path.join(home, '.cache', 'google-chrome', 'Default', 'Cache', 'Cache_Data'),
      path.join(home, '.cache', 'microsoft-edge', 'Default', 'Cache', 'Cache_Data')
    );
  }

  return paths.filter(p => fs.existsSync(p));
}

function decompressBuffer(buf) {
  if (!buf || buf.length === 0) return null;
  // Probe brotli (estándar Chromium moderno para tracker.gg)
  let brotliOk = null;
  try {
    brotliOk = zlib.brotliDecompressSync(buf);
  } catch (_notBrotli) {
    brotliOk = null;
  }
  if (brotliOk) return brotliOk;

  // Probe gzip solo si hay firma mágica (1f 8b)
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      return zlib.gunzipSync(buf);
    } catch (_badGzip) {
      return null;
    }
  }

  // Check if buffer starts with JSON
  const str = buf.toString('utf8');
  if (str.startsWith('{') || str.startsWith('[')) {
    return buf;
  }

  return null;
}

function extractFromCacheDirectory(cacheDir, filterPattern) {
  const data1Path = path.join(cacheDir, 'data_1');
  if (!fs.existsSync(data1Path)) return [];

  const results = [];
  const diagnostics = [];
  try {
    const data1 = fs.readFileSync(data1Path);
    const data2Path = path.join(cacheDir, 'data_2');
    const data3Path = path.join(cacheDir, 'data_3');
    const data2 = fs.existsSync(data2Path) ? fs.readFileSync(data2Path) : null;
    const data3 = fs.existsSync(data3Path) ? fs.readFileSync(data3Path) : null;

    const needle = 'api.tracker.gg/api/v2/valorant/standard/';
    let pos = 0;

    while (true) {
      const idx = data1.indexOf(needle, pos);
      if (idx === -1) break;
      pos = idx + needle.length;

      const entryStart = Math.floor(idx / 256) * 256;
      for (let cand = Math.max(0, entryStart - 512); cand <= idx; cand += 4) {
        if (cand + 24 > data1.length) continue;
        const d0 = data1.readInt32LE(cand);
        const d1 = data1.readInt32LE(cand + 4);
        if (d1 > 80 && d1 < 5000000 && d0 > 40 && d0 < 10000) {
          const addr1 = data1.readUInt32LE(cand + 20);
          const urlStart = data1.indexOf('http', cand);
          if (urlStart !== -1 && urlStart < cand + 300) {
            let urlEnd = urlStart;
            while (data1[urlEnd] >= 32 && data1[urlEnd] < 127 && data1[urlEnd] !== 34 && data1[urlEnd] !== 39) {
              urlEnd++;
            }
            const url = data1.slice(urlStart, urlEnd).toString('ascii');
            if (url.includes('tracker.gg')) {
              if (filterPattern && !url.toLowerCase().includes(filterPattern.toLowerCase())) {
                break;
              }

              const fileType = (addr1 >> 28) & 0x7;
              const blockNum = addr1 & 0xffff;
              let body = null;

              if (fileType === 0) {
                const fName = 'f_' + (addr1 & 0x0fffffff).toString(16).padStart(6, '0');
                const fPath = path.join(cacheDir, fName);
                if (fs.existsSync(fPath)) body = fs.readFileSync(fPath);
              } else if (fileType === 4 && data3) {
                const off = 8192 + blockNum * 4096;
                if (off + d1 <= data3.length) body = data3.slice(off, off + d1);
              } else if (fileType === 3 && data2) {
                const off = 8192 + blockNum * 1024;
                if (off + d1 <= data2.length) body = data2.slice(off, off + d1);
              }

              if (body) {
                const decomp = decompressBuffer(body);
                if (decomp) {
                  try {
                    const json = JSON.parse(decomp.toString('utf8'));
                    results.push({ url, cacheDir, json });
                  } catch (jsonErr) {
                    diagnostics.push(`Entrada no-JSON descartada en ${url.slice(0, 80)} (${jsonErr.message}).`);
                  }
                }
              }
              break;
            }
          }
        }
      }
    }
  } catch (scanErr) {
    diagnostics.push(`Extracción interrumpida en ${cacheDir}: ${scanErr.message}. Se devuelven resultados parciales.`);
  }

  if (diagnostics.length > 0) results.diagnostics = diagnostics;
  return results;
}

function harvestProfiles(handleQuery) {
  const cacheDirs = getChromiumCachePaths();
  const allResults = [];
  const cleanHandle = handleQuery ? handleQuery.replace('#', '%23').trim() : null;

  for (const dir of cacheDirs) {
    const hits = extractFromCacheDirectory(dir, cleanHandle);
    allResults.push(...hits);
  }

  return allResults;
}

function harvestMatch(matchId) {
  const cacheDirs = getChromiumCachePaths();
  for (const dir of cacheDirs) {
    const hits = extractFromCacheDirectory(dir, matchId);
    if (hits.length > 0 && hits[0].json && hits[0].json.data) {
      return hits[0].json.data;
    }
  }
  return null;
}

if (require.main === module) {
  const target = process.argv[2];
  console.log(`[browser_cache_harvester] Escaneando cachés de navegadores Chromium...`);
  const dirs = getChromiumCachePaths();
  console.log(`Directorios detectados: ${dirs.length}`);
  dirs.forEach(d => console.log(`  • ${d}`));

  const harvested = harvestProfiles(target);
  console.log(`\nEntradas extraídas con éxito: ${harvested.length}`);
  harvested.forEach((h, i) => {
    console.log(`[${i + 1}] ${h.url} (Data keys: ${Object.keys(h.json.data || {})})`);
  });
}

module.exports = {
  getChromiumCachePaths,
  decompressBuffer,
  extractFromCacheDirectory,
  harvestProfiles,
  harvestMatch
};
