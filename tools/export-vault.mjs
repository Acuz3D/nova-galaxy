// Reads a vault from disk into test/vault.json so the galaxy can be previewed in a browser.
// test/vault.json holds your notes' text, so it is git-ignored.
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, basename, sep } from 'node:path';
import { excerptOf } from '../src/data.js';

// your vault: NOVA_VAULT, or the path in vault-path.txt (git-ignored)
const VAULT = process.argv[2] || process.env.NOVA_VAULT || (existsSync('vault-path.txt') ? readFileSync('vault-path.txt', 'utf8').trim() : '');

if (!VAULT) throw new Error('Pass the vault path, set NOVA_VAULT, or write it in vault-path.txt');
const paths = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) paths.push(relative(VAULT, p).split(sep).join('/'));
  }
})(VAULT);

const byPath = new Map(paths.map((p) => [p.toLowerCase().replace(/\.md$/, ''), p]));
const byName = new Map(paths.map((p) => [basename(p, '.md').toLowerCase(), p]));
const files = [], links = {}, excerpts = {};
for (const p of paths) {
  const raw = readFileSync(join(VAULT, p), 'utf8');
  const st = statSync(join(VAULT, p));
  const tags = new Set([...raw.matchAll(/(?:^|\s)#([\p{L}\d_/-]+)/gu)].map((m) => m[1]).filter((t) => !/^\d+$/.test(t)));
  files.push({ path: p, name: basename(p, '.md'), ctime: st.birthtimeMs, mtime: st.mtimeMs, tags: [...tags] });
  excerpts[p] = excerptOf(raw);
  const out = {};
  for (const m of raw.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const t = m[1].split('|')[0].split('#')[0].trim().toLowerCase().replace(/\.md$/, '');
    const hit = byPath.get(t) || byName.get(t.split('/').pop());
    if (hit) out[hit] = (out[hit] || 0) + 1;
  }
  links[p] = out;
}
let groups = [];
const gj = join(VAULT, '.obsidian', 'graph.json');
if (existsSync(gj)) groups = (JSON.parse(readFileSync(gj, 'utf8')).colorGroups || []).map((g) => ({ query: g.query, rgb: g.color?.rgb || 0 }));
writeFileSync('test/vault.json', JSON.stringify({ files, links, groups, excerpts }));
console.log(`exported ${files.length} notes to test/vault.json`);
