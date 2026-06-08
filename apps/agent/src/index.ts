import os from 'node:os';
import { normalizeLogLine } from '@rtla/shared';
import { AgentClient } from './client';
import { tailFile } from './tail';

const file = process.env.LOG_FILE ?? './sample-logs/app.log';
const service = process.env.SERVICE_NAME ?? 'sample-api';
const host = process.env.HOST_NAME ?? os.hostname();
const backendUrl = process.env.BACKEND_WS_URL ?? 'http://localhost:3000';

const client = new AgentClient(backendUrl);
client.connect();

tailFile(file, (line) => {
  client.send(normalizeLogLine(line, { service, host }));
});

console.log(`agent tailing ${file} -> ${backendUrl}`);
