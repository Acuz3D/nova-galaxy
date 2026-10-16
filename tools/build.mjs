// Builds the plugin (dist/) and the browser preview (test/). With --install, copies the plugin into the vault.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// your vault: NOVA_VAULT, or the path in vault-path.txt (git-ignored)
const VAULT = process.env.NOVA_VAULT || (existsSync('vault-path.txt') ? readFileSync('vault-path.txt', 'utf8').trim() : '');

await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  external: ['obsidian', 'electron'],
  outfile: 'dist/main.js',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
});
copyFileSync('manifest.json', 'dist/manifest.json');
copyFileSync('styles.css', 'dist/styles.css');
console.log('built dist/');

if (existsSync('test/vault.json')) {
  await build({ entryPoints: ['test/harness.js'], bundle: true, format: 'iife', outfile: 'test/harness.bundle.js', logLevel: 'warning' });
  console.log('built test/harness.bundle.js');
}

if (process.argv.includes('--install')) {
  if (!VAULT) throw new Error('Set NOVA_VAULT or write your vault path in vault-path.txt');
  const dir = join(VAULT, '.obsidian', 'plugins', 'nova-galaxy');
  mkdirSync(dir, { recursive: true });
  for (const f of ['main.js', 'manifest.json', 'styles.css']) copyFileSync(join('dist', f), join(dir, f));
  console.log('installed into', dir);
}
