// Serves tracked HEAD sources read-only for before screenshots. It never
// checks out/stashes/replaces working files, and never starts backend workers.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const frontend = path.join(root, 'agents/frontend');
(async () => {
  const { createServer } = await import(pathToFileURL(path.join(frontend, 'node_modules/vite/dist/node/index.js')));
  const server = await createServer({
    root: frontend,
    configFile: path.join(frontend, 'vite.config.ts'),
    server: { host: '127.0.0.1', port: 5174, strictPort: true },
    plugins: [{
      name: 'read-only-ui-baseline', enforce: 'pre',
      load(id) {
        const file = path.normalize(id.split('?')[0]);
        if (!file.startsWith(path.join(frontend, 'src')) || !/\.(css|tsx|ts)$/.test(file)) return null;
        const relative = path.relative(root, file).replaceAll('\\', '/');
        try { return execFileSync('git', ['show', `HEAD:${relative}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
        catch { return null; }
      },
    }],
  });
  await server.listen();
  console.log('Read-only HEAD baseline at http://127.0.0.1:5174');
})().catch(error => { console.error(error.message); process.exit(1); });
