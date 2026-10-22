import { createApp } from './index.js';
import { MissionStore } from './missions.js';
import { VenueBrowserWorker } from './browser.js';
import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
if (existsSync('.env')) loadEnvFile('.env');
createApp(new MissionStore(), new VenueBrowserWorker()).listen(3001, '127.0.0.1', () => console.log('Atlas listening at http://127.0.0.1:3001/mcp'));
