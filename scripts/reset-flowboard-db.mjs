import path from 'node:path';
import { createTaskStore } from '../labs/flowboard-fullstack/server/src/store.ts';

const databasePath = process.env.FLOWBOARD_DATABASE_PATH || '.local/flowboard/flowboard.sqlite';
const store = createTaskStore({ databasePath: path.resolve(databasePath), seed: [] });
store.reset();
const taskCount = store.count();
store.close();
console.log(JSON.stringify({ success: true, databasePath, taskCount }, null, 2));
