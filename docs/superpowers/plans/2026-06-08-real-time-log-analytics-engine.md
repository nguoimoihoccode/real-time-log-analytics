# Real-time Log Analytics Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a portfolio-ready real-time log analytics MVP with WebSocket agent ingestion, RabbitMQ backpressure, Elasticsearch search/aggregation, and a React dashboard.

**Architecture:** Create a new `real-time-log-analytics/` monorepo. The agent tails logs and sends normalized events to a NestJS WebSocket API; the API validates and publishes to RabbitMQ; a worker bulk-indexes into Elasticsearch; the dashboard queries REST APIs and receives live logs over WebSocket.

**Tech Stack:** Node.js, TypeScript, NestJS, React, Vite, RabbitMQ, Elasticsearch, Docker Compose, Jest/Vitest.

---

## File Structure

- Create `real-time-log-analytics/package.json`: npm workspaces and root scripts.
- Create `real-time-log-analytics/tsconfig.base.json`: shared TS config.
- Create `real-time-log-analytics/apps/shared/src/log-event.ts`: normalized log event schema and parser helpers.
- Create `real-time-log-analytics/apps/agent/src/tail.ts`: file tailing.
- Create `real-time-log-analytics/apps/agent/src/client.ts`: WebSocket client/retry/buffer.
- Create `real-time-log-analytics/apps/agent/src/index.ts`: CLI entrypoint.
- Create `real-time-log-analytics/apps/api/src/ingestion.gateway.ts`: agent/dashboard WebSocket gateway.
- Create `real-time-log-analytics/apps/api/src/rabbitmq.service.ts`: RabbitMQ publishing.
- Create `real-time-log-analytics/apps/api/src/logs.controller.ts`: search/analytics REST API.
- Create `real-time-log-analytics/apps/api/src/elasticsearch.service.ts`: ES query builders.
- Create `real-time-log-analytics/apps/worker/src/indexer.worker.ts`: RabbitMQ consumer + ES bulk index.
- Create `real-time-log-analytics/apps/dashboard/src/*`: React dashboard.
- Create `real-time-log-analytics/infra/docker-compose.yml`: RabbitMQ + Elasticsearch.
- Create `real-time-log-analytics/README.md`: run/demo docs.

## Task 1: Monorepo Scaffold

**Files:**
- Create: `real-time-log-analytics/package.json`
- Create: `real-time-log-analytics/tsconfig.base.json`
- Create: `real-time-log-analytics/apps/shared/package.json`
- Create: `real-time-log-analytics/apps/shared/src/index.ts`

- [ ] **Step 1: Create root package**

```json
{
  "name": "real-time-log-analytics",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "dev:api": "npm run start:dev -w @rtla/api",
    "dev:worker": "npm run start:dev -w @rtla/worker",
    "dev:agent": "npm run dev -w @rtla/agent",
    "dev:dashboard": "npm run dev -w @rtla/dashboard"
  },
  "devDependencies": {
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: Create shared TypeScript config**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist"
  }
}
```

- [ ] **Step 3: Create shared package**

```json
{
  "name": "@rtla/shared",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "jest"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5"
  }
}
```

- [ ] **Step 4: Add shared export placeholder**

```ts
export {};
```

- [ ] **Step 5: Install deps**

Run: `cd real-time-log-analytics && npm install`
Expected: `package-lock.json` created, no install errors.

## Task 2: Shared Log Event Schema

**Files:**
- Create: `real-time-log-analytics/apps/shared/tsconfig.json`
- Create: `real-time-log-analytics/apps/shared/jest.config.js`
- Create: `real-time-log-analytics/apps/shared/src/log-event.ts`
- Create: `real-time-log-analytics/apps/shared/src/log-event.spec.ts`
- Modify: `real-time-log-analytics/apps/shared/src/index.ts`

- [ ] **Step 1: Write failing schema tests**

```ts
import { normalizeLogLine, logEventSchema } from './log-event';

describe('log-event', () => {
  it('normalizes a plain error line', () => {
    const event = normalizeLogLine('[ERROR] Payment gateway timeout', {
      service: 'payment-api',
      host: 'server-01',
    });

    expect(event.level).toBe('error');
    expect(event.service).toBe('payment-api');
    expect(event.host).toBe('server-01');
    expect(event.message).toBe('Payment gateway timeout');
    expect(logEventSchema.parse(event)).toEqual(event);
  });

  it('normalizes JSON log lines', () => {
    const event = normalizeLogLine('{"level":"warn","message":"slow query","requestId":"req_1"}', {
      service: 'api',
      host: 'server-02',
    });

    expect(event.level).toBe('warn');
    expect(event.message).toBe('slow query');
    expect(event.metadata.requestId).toBe('req_1');
  });
});
```

- [ ] **Step 2: Add TS/Jest config**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*.ts"]
}
```

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
};
```

- [ ] **Step 3: Run test to verify fail**

Run: `cd real-time-log-analytics && npm test -w @rtla/shared`
Expected: FAIL because `./log-event` does not exist.

- [ ] **Step 4: Implement schema/parser**

```ts
import { z } from 'zod';

export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error', 'fatal']);

export const logEventSchema = z.object({
  timestamp: z.string().datetime(),
  receivedAt: z.string().datetime().optional(),
  level: logLevelSchema,
  service: z.string().min(1),
  host: z.string().min(1),
  message: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
});

export type LogEvent = z.infer<typeof logEventSchema>;

export interface LogSourceContext {
  service: string;
  host: string;
}

const LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;

function inferLevel(line: string): LogEvent['level'] {
  const lower = line.toLowerCase();
  return LEVELS.find((level) => lower.includes(level)) ?? 'info';
}

export function normalizeLogLine(line: string, context: LogSourceContext): LogEvent {
  const trimmed = line.trim();
  const timestamp = new Date().toISOString();

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const level = typeof parsed.level === 'string' && LEVELS.includes(parsed.level as LogEvent['level'])
      ? (parsed.level as LogEvent['level'])
      : inferLevel(trimmed);
    const message = typeof parsed.message === 'string' ? parsed.message : trimmed;
    const { level: _level, message: _message, ...metadata } = parsed;

    return logEventSchema.parse({ timestamp, level, service: context.service, host: context.host, message, metadata });
  } catch {
    const message = trimmed.replace(/^\[(debug|info|warn|error|fatal)\]\s*/i, '');
    return logEventSchema.parse({ timestamp, level: inferLevel(trimmed), service: context.service, host: context.host, message, metadata: {} });
  }
}
```

- [ ] **Step 5: Export schema/parser**

```ts
export * from './log-event';
```

- [ ] **Step 6: Run tests**

Run: `cd real-time-log-analytics && npm test -w @rtla/shared`
Expected: PASS.

## Task 3: Infra Compose

**Files:**
- Create: `real-time-log-analytics/infra/docker-compose.yml`
- Create: `real-time-log-analytics/infra/rabbitmq/definitions.json`

- [ ] **Step 1: Add RabbitMQ definitions**

```json
{
  "queues": [
    { "name": "logs.raw", "vhost": "/", "durable": true, "auto_delete": false, "arguments": { "x-dead-letter-exchange": "logs.dlx" } },
    { "name": "logs.dlq", "vhost": "/", "durable": true, "auto_delete": false, "arguments": {} }
  ],
  "exchanges": [
    { "name": "logs.dlx", "vhost": "/", "type": "direct", "durable": true, "auto_delete": false, "internal": false, "arguments": {} }
  ],
  "bindings": [
    { "source": "logs.dlx", "vhost": "/", "destination": "logs.dlq", "destination_type": "queue", "routing_key": "logs.raw", "arguments": {} }
  ]
}
```

- [ ] **Step 2: Add Docker Compose**

```yaml
services:
  rabbitmq:
    image: rabbitmq:3.13-management
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
      RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS: "-rabbitmq_management load_definitions \"/etc/rabbitmq/definitions.json\""
    volumes:
      - ./rabbitmq/definitions.json:/etc/rabbitmq/definitions.json:ro

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.14.3
    ports:
      - "9200:9200"
    environment:
      discovery.type: single-node
      xpack.security.enabled: "false"
      ES_JAVA_OPTS: "-Xms512m -Xmx512m"
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:9200/_cluster/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 20
```

- [ ] **Step 3: Verify infra starts**

Run: `cd real-time-log-analytics/infra && docker compose up -d`
Expected: RabbitMQ on `http://localhost:15672`, Elasticsearch on `http://localhost:9200`.

## Task 4: Agent File Tail + WebSocket Client

**Files:**
- Create: `real-time-log-analytics/apps/agent/package.json`
- Create: `real-time-log-analytics/apps/agent/tsconfig.json`
- Create: `real-time-log-analytics/apps/agent/src/tail.ts`
- Create: `real-time-log-analytics/apps/agent/src/client.ts`
- Create: `real-time-log-analytics/apps/agent/src/index.ts`

- [ ] **Step 1: Create package**

```json
{
  "name": "@rtla/agent",
  "version": "0.1.0",
  "main": "dist/index.js",
  "scripts": { "build": "tsc -p tsconfig.json", "dev": "tsx src/index.ts" },
  "dependencies": { "@rtla/shared": "0.1.0", "ws": "^8.18.0" },
  "devDependencies": { "@types/node": "^20.14.10", "@types/ws": "^8.5.12", "tsx": "^4.16.2" }
}
```

- [ ] **Step 2: Add tsconfig**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Implement file tailer**

```ts
import fs from 'node:fs';

export function tailFile(path: string, onLine: (line: string) => void): void {
  let position = fs.existsSync(path) ? fs.statSync(path).size : 0;

  fs.watchFile(path, { interval: 500 }, () => {
    if (!fs.existsSync(path)) return;
    const size = fs.statSync(path).size;
    if (size < position) position = 0;
    if (size === position) return;

    const stream = fs.createReadStream(path, { start: position, end: size - 1, encoding: 'utf8' });
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) onLine(line);
    });
    stream.on('end', () => { position = size; });
  });
}
```

- [ ] **Step 4: Implement WebSocket client**

```ts
import WebSocket from 'ws';
import type { LogEvent } from '@rtla/shared';

export class AgentClient {
  private socket?: WebSocket;
  private buffer: LogEvent[] = [];
  private reconnectMs = 1000;

  constructor(private readonly url: string, private readonly maxBuffer = 1000) {}

  connect(): void {
    this.socket = new WebSocket(this.url);
    this.socket.on('open', () => { this.reconnectMs = 1000; this.flush(); });
    this.socket.on('close', () => this.scheduleReconnect());
    this.socket.on('error', () => this.socket?.close());
  }

  send(event: LogEvent): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'log', payload: event }));
      return;
    }
    this.buffer.push(event);
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();
  }

  private flush(): void {
    const pending = this.buffer.splice(0);
    for (const event of pending) this.send(event);
  }

  private scheduleReconnect(): void {
    setTimeout(() => this.connect(), this.reconnectMs);
    this.reconnectMs = Math.min(this.reconnectMs * 2, 30000);
  }
}
```

- [ ] **Step 5: Implement CLI entrypoint**

```ts
import os from 'node:os';
import { normalizeLogLine } from '@rtla/shared';
import { AgentClient } from './client';
import { tailFile } from './tail';

const file = process.env.LOG_FILE ?? './sample-logs/app.log';
const service = process.env.SERVICE_NAME ?? 'sample-api';
const host = process.env.HOST_NAME ?? os.hostname();
const backendUrl = process.env.BACKEND_WS_URL ?? 'ws://localhost:3000/ingest';

const client = new AgentClient(backendUrl);
client.connect();

tailFile(file, (line) => {
  client.send(normalizeLogLine(line, { service, host }));
});

console.log(`agent tailing ${file} -> ${backendUrl}`);
```

- [ ] **Step 6: Build agent**
Run: `cd real-time-log-analytics && npm run build -w @rtla/agent`
Expected: PASS.

## Task 5: NestJS API Gateway + RabbitMQ Publisher

**Files:**
- Create: `real-time-log-analytics/apps/api/package.json`
- Create: `real-time-log-analytics/apps/api/src/main.ts`
- Create: `real-time-log-analytics/apps/api/src/app.module.ts`
- Create: `real-time-log-analytics/apps/api/src/rabbitmq.service.ts`
- Create: `real-time-log-analytics/apps/api/src/ingestion.gateway.ts`

- [ ] **Step 1: Create API package**

```json
{
  "name": "@rtla/api",
  "version": "0.1.0",
  "scripts": { "build": "nest build", "start:dev": "nest start --watch" },
  "dependencies": {
    "@nestjs/common": "^10.3.10",
    "@nestjs/core": "^10.3.10",
    "@nestjs/platform-socket.io": "^10.3.10",
    "@nestjs/websockets": "^10.3.10",
    "@rtla/shared": "0.1.0",
    "amqplib": "^0.10.4",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": { "@nestjs/cli": "^10.4.2", "@types/amqplib": "^0.10.5", "@types/node": "^20.14.10" }
}
```

- [ ] **Step 2: Implement RabbitMQ publisher**

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import amqp, { Channel, Connection } from 'amqplib';

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private connection?: Connection;
  private channel?: Channel;

  async onModuleInit(): Promise<void> {
    this.connection = await amqp.connect(process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672');
    this.channel = await this.connection.createChannel();
    await this.channel.assertQueue('logs.raw', { durable: true, deadLetterExchange: 'logs.dlx' });
  }

  publishLog(event: unknown): boolean {
    if (!this.channel) throw new Error('RabbitMQ channel not ready');
    return this.channel.sendToQueue('logs.raw', Buffer.from(JSON.stringify(event)), { persistent: true });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }
}
```

- [ ] **Step 3: Implement ingestion gateway**

```ts
import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { logEventSchema } from '@rtla/shared';
import { RabbitmqService } from './rabbitmq.service';

@WebSocketGateway({ cors: true, namespace: '/' })
export class IngestionGateway {
  @WebSocketServer() server!: Server;

  constructor(private readonly rabbitmq: RabbitmqService) {}

  @SubscribeMessage('log')
  handleLog(@MessageBody() body: unknown): { ok: boolean } {
    const payload = typeof body === 'object' && body && 'payload' in body ? (body as { payload: unknown }).payload : body;
    const event = logEventSchema.parse({ ...(payload as object), receivedAt: new Date().toISOString() });
    this.rabbitmq.publishLog(event);
    this.server.emit('live-log', event);
    return { ok: true };
  }
}
```

- [ ] **Step 4: Wire Nest app**

```ts
import { Module } from '@nestjs/common';
import { IngestionGateway } from './ingestion.gateway';
import { RabbitmqService } from './rabbitmq.service';

@Module({ providers: [IngestionGateway, RabbitmqService] })
export class AppModule {}
```

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}
bootstrap();
```

- [ ] **Step 5: Build API**
Run: `cd real-time-log-analytics && npm run build -w @rtla/api`
Expected: PASS.

## Task 6: Worker Bulk Indexer

**Files:**
- Create: `real-time-log-analytics/apps/worker/package.json`
- Create: `real-time-log-analytics/apps/worker/src/indexer.worker.ts`
- Create: `real-time-log-analytics/apps/worker/src/main.ts`

- [ ] **Step 1: Create worker package**

```json
{
  "name": "@rtla/worker",
  "version": "0.1.0",
  "scripts": { "build": "tsc -p tsconfig.json", "start:dev": "tsx src/main.ts" },
  "dependencies": { "@elastic/elasticsearch": "^8.14.0", "@rtla/shared": "0.1.0", "amqplib": "^0.10.4" },
  "devDependencies": { "@types/amqplib": "^0.10.5", "@types/node": "^20.14.10", "tsx": "^4.16.2" }
}
```

- [ ] **Step 2: Implement worker**

```ts
import { Client } from '@elastic/elasticsearch';
import amqp, { Channel, ConsumeMessage } from 'amqplib';
import { logEventSchema, type LogEvent } from '@rtla/shared';

export class IndexerWorker {
  private readonly es = new Client({ node: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200' });
  private channel?: Channel;
  private batch: { msg: ConsumeMessage; event: LogEvent }[] = [];

  async start(): Promise<void> {
    const conn = await amqp.connect(process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672');
    this.channel = await conn.createChannel();
    await this.channel.assertQueue('logs.raw', { durable: true, deadLetterExchange: 'logs.dlx' });
    await this.channel.prefetch(100);
    await this.ensureIndexTemplate();
    await this.channel.consume('logs.raw', (msg) => msg && this.handle(msg), { noAck: false });
    setInterval(() => void this.flush(), 1000);
  }

  private handle(msg: ConsumeMessage): void {
    try {
      const event = logEventSchema.parse(JSON.parse(msg.content.toString()));
      this.batch.push({ msg, event });
      if (this.batch.length >= 100) void this.flush();
    } catch {
      this.channel?.nack(msg, false, false);
    }
  }

  private async flush(): Promise<void> {
    if (!this.channel || this.batch.length === 0) return;
    const items = this.batch.splice(0);
    const operations = items.flatMap(({ event }) => [{ index: { _index: this.indexName(event.timestamp) } }, event]);
    try {
      const result = await this.es.bulk({ refresh: false, operations });
      if (result.errors) throw new Error('bulk index contained errors');
      for (const item of items) this.channel.ack(item.msg);
    } catch {
      for (const item of items) this.channel.nack(item.msg, false, true);
    }
  }

  private indexName(timestamp: string): string {
    return `logs-${timestamp.slice(0, 10).replaceAll('-', '.')}`;
  }

  private async ensureIndexTemplate(): Promise<void> {
    await this.es.indices.putIndexTemplate({
      name: 'logs-template',
      index_patterns: ['logs-*'],
      template: {
        mappings: {
          properties: {
            timestamp: { type: 'date' },
            receivedAt: { type: 'date' },
            level: { type: 'keyword' },
            service: { type: 'keyword' },
            host: { type: 'keyword' },
            message: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
            metadata: { type: 'object', enabled: true },
          },
        },
      },
    });
  }
}
```

- [ ] **Step 3: Add main**

```ts
import { IndexerWorker } from './indexer.worker';

void new IndexerWorker().start();
console.log('indexer worker started');
```

- [ ] **Step 4: Build worker**
Run: `cd real-time-log-analytics && npm run build -w @rtla/worker`
Expected: PASS.

## Task 7: Query API

**Files:**
- Create: `real-time-log-analytics/apps/api/src/elasticsearch.service.ts`
- Create: `real-time-log-analytics/apps/api/src/logs.controller.ts`
- Modify: `real-time-log-analytics/apps/api/src/app.module.ts`

- [ ] **Step 1: Implement ES query service**

```ts
import { Injectable } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';

@Injectable()
export class ElasticsearchService {
  private readonly client = new Client({ node: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200' });

  search(params: Record<string, string | undefined>) {
    const filter: object[] = [];
    if (params.from || params.to) filter.push({ range: { timestamp: { gte: params.from, lte: params.to } } });
    for (const key of ['level', 'service', 'host']) if (params[key]) filter.push({ term: { [key]: params[key] } });
    const must = params.q ? [{ match: { message: params.q } }] : [];
    return this.client.search({ index: 'logs-*', size: 100, sort: [{ timestamp: 'desc' }], query: { bool: { filter, must } } });
  }

  logsPerSecond(from: string, to: string) {
    return this.client.search({ index: 'logs-*', size: 0, query: { range: { timestamp: { gte: from, lte: to } } }, aggs: { logs_per_second: { date_histogram: { field: 'timestamp', fixed_interval: '1s' } } } });
  }

  terms(field: 'level' | 'service') {
    return this.client.search({ index: 'logs-*', size: 0, aggs: { values: { terms: { field, size: 10 } } } });
  }
}
```

- [ ] **Step 2: Implement REST controller**

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';

@Controller()
export class LogsController {
  constructor(private readonly es: ElasticsearchService) {}

  @Get('/logs/search')
  search(@Query() query: Record<string, string | undefined>) {
    return this.es.search(query);
  }

  @Get('/analytics/logs-per-second')
  logsPerSecond(@Query('from') from = 'now-15m', @Query('to') to = 'now') {
    return this.es.logsPerSecond(from, to);
  }

  @Get('/analytics/by-level')
  byLevel() {
    return this.es.terms('level');
  }

  @Get('/analytics/by-service')
  byService() {
    return this.es.terms('service');
  }

  @Get('/health')
  health() {
    return { ok: true };
  }
}
```

- [ ] **Step 3: Wire module**

```ts
import { Module } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';
import { IngestionGateway } from './ingestion.gateway';
import { LogsController } from './logs.controller';
import { RabbitmqService } from './rabbitmq.service';

@Module({ controllers: [LogsController], providers: [IngestionGateway, RabbitmqService, ElasticsearchService] })
export class AppModule {}
```

- [ ] **Step 4: Build API**
Run: `cd real-time-log-analytics && npm run build -w @rtla/api`
Expected: PASS.

## Task 8: React Dashboard

**Files:**
- Create: `real-time-log-analytics/apps/dashboard/package.json`
- Create: `real-time-log-analytics/apps/dashboard/src/App.tsx`
- Create: `real-time-log-analytics/apps/dashboard/src/main.tsx`
- Create: `real-time-log-analytics/apps/dashboard/src/styles.css`

- [ ] **Step 1: Create dashboard package**

```json
{
  "name": "@rtla/dashboard",
  "version": "0.1.0",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": { "@vitejs/plugin-react": "^4.3.1", "vite": "^5.3.4", "react": "^18.3.1", "react-dom": "^18.3.1", "socket.io-client": "^4.7.5", "recharts": "^2.12.7" },
  "devDependencies": { "@types/react": "^18.3.3", "@types/react-dom": "^18.3.0", "typescript": "^5.5.4" }
}
```

- [ ] **Step 2: Implement dashboard app**

```tsx
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import './styles.css';

type LogEvent = { timestamp: string; level: string; service: string; host: string; message: string };
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export default function App() {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);

  useEffect(() => {
    const socket = io(API);
    socket.on('live-log', (event: LogEvent) => setLogs((current) => [event, ...current].slice(0, 100)));
    return () => { socket.close(); };
  }, []);

  useEffect(() => {
    const load = async () => {
      const [levelRes, serviceRes] = await Promise.all([fetch(`${API}/analytics/by-level`), fetch(`${API}/analytics/by-service`)]);
      const levelJson = await levelRes.json();
      const serviceJson = await serviceRes.json();
      setLevels(levelJson.aggregations?.values?.buckets ?? []);
      setServices(serviceJson.aggregations?.values?.buckets ?? []);
    };
    void load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main>
      <section className="hero"><h1>Real-time Log Analytics</h1><p>Live ingestion, RabbitMQ backpressure, Elasticsearch analytics.</p></section>
      <section className="grid">
        <div className="card"><h2>Levels</h2><ResponsiveContainer height={220}><BarChart data={levels}><XAxis dataKey="key" /><YAxis /><Tooltip /><Bar dataKey="doc_count" fill="#7c3aed" /></BarChart></ResponsiveContainer></div>
        <div className="card"><h2>Services</h2><ResponsiveContainer height={220}><LineChart data={services}><XAxis dataKey="key" /><YAxis /><Tooltip /><Line dataKey="doc_count" stroke="#06b6d4" /></LineChart></ResponsiveContainer></div>
      </section>
      <section className="card"><h2>Live Logs</h2>{logs.map((log, index) => <div className={`log ${log.level}`} key={`${log.timestamp}-${index}`}><span>{log.level}</span><strong>{log.service}</strong><p>{log.message}</p></div>)}</section>
    </main>
  );
}
```

- [ ] **Step 3: Add entrypoint/style**

```tsx
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);
```

```css
body { margin: 0; background: #09090b; color: #e5e7eb; font-family: Inter, system-ui, sans-serif; }
main { padding: 32px; }
.hero { margin-bottom: 24px; }
.hero h1 { font-size: 40px; margin: 0 0 8px; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.card { background: rgba(24,24,27,.86); border: 1px solid #27272a; border-radius: 16px; padding: 20px; margin-bottom: 16px; }
.log { display: grid; grid-template-columns: 80px 160px 1fr; gap: 12px; padding: 10px 0; border-bottom: 1px solid #27272a; }
.log span { text-transform: uppercase; font-size: 12px; color: #a1a1aa; }
.log.error span, .log.fatal span { color: #f87171; }
.log.warn span { color: #facc15; }
@media (max-width: 800px) { .grid { grid-template-columns: 1fr; } .log { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Build dashboard**
Run: `cd real-time-log-analytics && npm run build -w @rtla/dashboard`
Expected: PASS.

## Task 9: Sample Logs + README

**Files:**
- Create: `real-time-log-analytics/sample-logs/app.log`
- Create: `real-time-log-analytics/README.md`

- [ ] **Step 1: Add sample log file**

```text
[INFO] application started
[WARN] slow query detected
[ERROR] payment gateway timeout
```

- [ ] **Step 2: Add README**

```md
# Real-time Log Analytics Engine

MVP log analytics platform inspired by a small ELK/Grafana pipeline.

## Architecture

Agent tails a log file -> WebSocket API -> RabbitMQ `logs.raw` -> worker bulk indexes -> Elasticsearch `logs-*` -> dashboard queries analytics and receives live logs.

## Run

```bash
cd infra
docker compose up -d
cd ..
npm install
npm run dev:api
npm run dev:worker
LOG_FILE=sample-logs/app.log npm run dev:agent
npm run dev:dashboard
```

Append logs:

```bash
printf '[ERROR] checkout failed\n' >> sample-logs/app.log
```

## Portfolio Highlights

- Backpressure via RabbitMQ durable queue and worker prefetch.
- Search via Elasticsearch text queries and keyword filters.
- Aggregations via terms and date histogram queries.
- Realtime via WebSocket ingestion and dashboard live tail.
- Reliability via bounded agent buffer, retry, manual ack/nack, and DLQ.
```

- [ ] **Step 3: Final verification**
Run: `cd real-time-log-analytics && npm run build && npm test`
Expected: PASS.

## Self-Review

- Spec coverage: agent, WebSocket gateway, RabbitMQ backpressure, Elasticsearch mapping/query, dashboard, Docker Compose, docs all mapped to tasks.
- Scope: metrics, alerting, auth, Kafka, gRPC, Go agent remain roadmap only.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps.
- Type consistency: `LogEvent`, `logEventSchema`, `normalizeLogLine`, `logs.raw`, `logs.dlq`, `live-log` names consistent across tasks.
