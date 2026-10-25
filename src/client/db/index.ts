import { createRepo } from './repo.ts';
import { ExpResDb } from './schema.ts';

export const db = new ExpResDb();
export const repo = createRepo(db);
