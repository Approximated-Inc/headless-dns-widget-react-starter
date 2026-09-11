import { createServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import config from './vite.config.mjs';
import { createTokenHandler } from './token-server.mjs';

if (process.env.NODE_ENV === 'production') {
  throw new Error('This localhost demo server cannot run in production. See README for authentication requirements.');
}
const port = 5173;
const origin = `http://127.0.0.1:${port}`;
const tokenHandler = createTokenHandler({ apiKey: process.env.APX_API_KEY, origin });
const server = createServer((req, res) => {
  if (req.headers.host !== `127.0.0.1:${port}`) {
    res.writeHead(403); res.end('Open this demo at ' + origin); return;
  }
  if (req.url?.split('?')[0] === '/api/dns-widget-token') {
    void tokenHandler(req, res);
  } else {
    vite.middlewares(req, res);
  }
});
const vite = await createViteServer({ ...config, server: {
  ...config.server, middlewareMode: true, hmr: { server }, cors: false
} });
server.listen(port, '127.0.0.1', () => console.log(`React headless DNS starter: ${origin}`));
server.on('error', async (error) => { console.error(error.message); await vite.close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => { server.closeAllConnections(); server.close(); await vite.close(); });
}
