// Bundles the window (screens, editor and styles) into dist/renderer.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'renderer');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'src/renderer/index.html'), join(out, 'index.html'));
cpSync(join(root, 'build/icon.png'), join(out, 'icon.png'));

await build({
  entryPoints: {
    app: join(root, 'src/renderer/app.js'),
    style: join(root, 'src/renderer/style.css'),
    fonts: join(root, 'src/renderer/fonts.css'), // For print files, which load these by themselves.
  },
  outdir: out,
  bundle: true,
  format: 'iife', // file:// pages can't load ES modules, so this ships one classic script.
  platform: 'browser',
  target: ['chrome130'],
  minify: true,
  legalComments: 'linked',
  logLevel: 'warning',
  loader: { '.woff2': 'file', '.woff': 'file' },
  assetNames: 'fonts/[name]-[hash]',
  define: { 'process.env.NODE_ENV': '"production"' },
});
