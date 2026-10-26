import { createApp } from './app.ts';
import { d1ClaimRepo } from './claims/d1-repo.ts';
import { d1HealthRepo } from './health.ts';

export default createApp((env) => ({ health: d1HealthRepo(env.DB), claims: d1ClaimRepo(env.DB) }));
