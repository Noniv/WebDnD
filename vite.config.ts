import { defineConfig, type Plugin } from 'vite';

// Serves the Vercel functions in /api during `npm run dev`, so the game
// behaves the same locally as on Vercel. Handlers use only the Node
// (req, res) API, so no Vercel-specific shims are needed.
function vercelApiDev(): Plugin {
  return {
    name: 'vercel-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/([a-z0-9-]+)/i);
        if (!m) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.js`);
          await mod.default(req, res);
        } catch (err) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [vercelApiDev()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  server: { host: true },
});
