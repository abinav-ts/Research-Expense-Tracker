import { createApp } from './app.ts';
import { d1HealthRepo } from './health.ts';

export default createApp((env) => d1HealthRepo(env.DB));
