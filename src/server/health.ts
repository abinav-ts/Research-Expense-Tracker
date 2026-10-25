// M0: proves the deployed Worker can read and write D1. The route talks to a small interface
// (like the planned ClaimRepo) so tests can run without Cloudflare.

export interface HealthReading {
  hits: number;
  checkedAt: string;
}

export interface HealthRepo {
  /** Records one check (write) and returns the stored state (read). */
  ping(nowIso: string): Promise<HealthReading>;
}

export function d1HealthRepo(db: D1Database): HealthRepo {
  return {
    async ping(nowIso) {
      const [, read] = await db.batch<{ hits: number; checked_at: string }>([
        db
          .prepare(
            'INSERT INTO health_check (id, hits, checked_at) VALUES (1, 1, ?1) ' +
              'ON CONFLICT(id) DO UPDATE SET hits = hits + 1, checked_at = ?1',
          )
          .bind(nowIso),
        db.prepare('SELECT hits, checked_at FROM health_check WHERE id = 1'),
      ]);
      const row = read?.results[0];
      if (!row) throw new Error('health_check row missing after write');
      return { hits: row.hits, checkedAt: row.checked_at };
    },
  };
}
