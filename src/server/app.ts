import { Hono } from 'hono';
import { claimRoutes } from './claims/routes.ts';
import type { ClaimRepo } from './claims/repo.ts';
import type { HealthRepo } from './health.ts';

export interface AppDeps {
  health: HealthRepo;
  claims: ClaimRepo;
  now?: () => Date;
  newId?: () => string;
}

export function createApp(depsFor: (env: Env) => AppDeps) {
  const app = new Hono<{ Bindings: Env }>();

  // REQ-REV-07: nothing under /api is for search engines, and claim data is never cached.
  app.use('/api/*', async (c, next) => {
    await next();
    c.res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
  });

  app.get('/api/health', async (c) => {
    c.header('Cache-Control', 'no-store');
    try {
      const reading = await depsFor(c.env).health.ping(new Date().toISOString());
      return c.json({ ok: true, db: reading });
    } catch {
      return c.json({ ok: false, error: 'database unavailable' }, 500);
    }
  });

  app.route(
    '/',
    claimRoutes((c) => {
      const deps = depsFor(c.env as Env);
      return { claims: deps.claims, now: deps.now ?? (() => new Date()), newId: deps.newId ?? (() => crypto.randomUUID()) };
    }),
  );

  // Anything else under /api is an unknown endpoint, never the app shell.
  app.all('/api/*', (c) => c.json({ ok: false, error: 'not found' }, 404));

  return app;
}
