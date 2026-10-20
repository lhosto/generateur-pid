import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Injecte le catalogue dans index.html (bloc <script id="catalogue">).
// Le logiciel Openness remplacera ce même bloc par l'export réel de la librairie.
function catalogue(): Plugin {
  const file = resolve(__dirname, 'src/catalogue.json');
  return {
    name: 'inject-catalogue',
    transformIndexHtml(html) {
      const json = JSON.stringify(JSON.parse(readFileSync(file, 'utf8'))).replace(/<\/script/gi, '<\/script');
      return html.replace('/*CATALOGUE*/', json);
    },
    handleHotUpdate(ctx) {
      if (ctx.file === file) ctx.server.ws.send({ type: 'full-reload' });
    },
  };
}

// Le livrable s'appelle editeur-pid.html (un seul fichier, ouvert depuis SharePoint).
function rename(): Plugin {
  return {
    name: 'rename-output',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = bundle['index.html'];
      if (html) html.fileName = 'editeur-pid.html';
    },
  };
}

export default defineConfig({
  plugins: [react(), catalogue(), viteSingleFile(), rename()],
  build: { assetsInlineLimit: 100_000_000, cssCodeSplit: false, outDir: 'dist' },
});
