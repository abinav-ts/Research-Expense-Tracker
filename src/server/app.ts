import { Hono } from 'hono';
import type { HealthRepo } from './health.ts';

export function createApp(healthRepoFor: (env: Env) => HealthRepo) {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/api/health', async (c) => {
    c.header('Cache-Control', 'no-store');
    try {
      const reading = await healthRepoFor(c.env).ping(new Date().toISOString());
      return c.json({ ok: true, db: reading });
    } catch {
      return c.json({ ok: false, error: 'database unavailable' }, 500);
    }
  });

  // Anything else under /api is an unknown endpoint, never the app shell.
  app.all('/api/*', (c) => c.json({ ok: false, error: 'not found' }, 404));

  return app;
}
