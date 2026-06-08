# Real-time Log Analytics & Dashboard Engine Design

Date: 2026-06-08

## Goal

Build a portfolio-ready real-time log analytics engine: a small server agent streams logs to a backend, the backend absorbs bursts with RabbitMQ, Elasticsearch stores/searches logs, and a React dashboard shows live logs plus real-time aggregations.

The MVP focuses on centralized log ingestion, backpressure, optimized search, and real-time dashboarding. Metrics, alerting, auth, multi-tenancy, Kafka, and gRPC are roadmap items, not MVP scope.

## Recommended Stack

- Backend: Node.js with NestJS.
- Frontend: React + TypeScript.
- Agent: Node.js CLI agent for MVP.
- Transport from agent to backend: WebSocket.
- Queue/backpressure: RabbitMQ.
- Search/analytics database: Elasticsearch.
- Local infra: Docker Compose.

## Alternatives Considered

### Option A: MVP Portfolio Stack - Selected

NestJS, RabbitMQ, Elasticsearch, React dashboard, Node.js WebSocket agent.

Pros: fast to build, easy local demo, strong enough to show core data/streaming concepts, fits existing workspace patterns.

Cons: RabbitMQ is less streaming-native than Kafka; Node agent is less systems-oriented than Go.

### Option B: Data-heavy Stack

NestJS, Kafka, ClickHouse, React dashboard.

Pros: stronger high-throughput story and excellent aggregations.

Cons: heavier local setup, weaker full-text log search than Elasticsearch, longer implementation.

### Option C: Enterprise gRPC Stack

.NET Core or NestJS with gRPC streaming, RabbitMQ or Kafka, Elasticsearch.

Pros: stronger backend profile and typed streaming contracts.

Cons: slower MVP delivery and more protocol complexity.

## Architecture

```text
Server log file
  -> Agent tails file
  -> WebSocket ingestion gateway
  -> RabbitMQ logs.raw queue
  -> Indexer worker bulk indexes
  -> Elasticsearch logs-* indices
  -> Query API
  -> React dashboard

Elasticsearch aggregations
  -> logs/sec chart
  -> level distribution
  -> top services
  -> recent errors

Backend live stream
  -> dashboard live log tail
```

## Components

### Agent

Purpose: run on a server, tail a configured log file, parse each line into a normalized log event, and stream events to the backend.

Responsibilities:

- Load config: backend URL, service name, host name, log file path, optional auth token.
- Tail appended log lines without rereading the whole file on restart.
- Parse each line into a log event.
- Send events via WebSocket.
- Buffer unsent events in memory during short disconnects.
- Reconnect with exponential backoff.

MVP constraints:

- Memory buffer only, no disk spool.
- One log file per agent process.
- Basic regex/JSON parsing, not a full parser framework.

### Ingestion Gateway

Purpose: accept logs from agents and publish them to RabbitMQ without blocking on Elasticsearch.

Responsibilities:

- Expose WebSocket endpoint for agents.
- Validate event schema.
- Add ingestion metadata: `receivedAt`, `agentId`, `service`, `host`.
- Publish valid events to `logs.raw`.
- Emit accepted events to dashboard WebSocket channel for live tail.
- Reject malformed events with structured error responses.

### RabbitMQ Queue Layer

Purpose: absorb bursts and protect Elasticsearch from direct high-volume writes.

Queues:

- `logs.raw`: durable queue for validated log events.
- `logs.dlq`: dead-letter queue for events that repeatedly fail indexing.

Configuration:

- Durable queues.
- Manual ack/nack.
- Consumer prefetch to limit indexing concurrency.
- Dead-letter exchange for failed messages.

### Indexer Worker

Purpose: consume queued logs and write them efficiently to Elasticsearch.

Responsibilities:

- Consume from `logs.raw`.
- Batch events into Elasticsearch bulk index requests.
- Ack messages only after successful bulk indexing.
- Retry transient Elasticsearch errors.
- Nack or route poison messages to `logs.dlq`.
- Log indexing latency and failure counts.

### Elasticsearch

Purpose: store logs for full-text search, filtering, and aggregations.

Index pattern:

- `logs-YYYY.MM.DD` for daily indices.

Mapping:

- `timestamp`: `date`.
- `receivedAt`: `date`.
- `level`: `keyword`.
- `service`: `keyword`.
- `host`: `keyword`.
- `message`: `text`.
- `message.keyword`: `keyword` with ignore-above limit.
- `metadata`: `object`.

Query rules:

- Use `bool.filter` for structured filters.
- Use `range` on `timestamp` for time windows.
- Use `match` on `message` for text search.
- Use `date_histogram` for logs/sec.
- Use `terms` aggregation for level/service/host charts.
- Use `search_after` for pagination, not deep offset pagination.

### Query API

Purpose: expose search and aggregation endpoints to the dashboard.

Endpoints:

- `GET /logs/search`: filters by time range, level, service, host, and message query.
- `GET /analytics/logs-per-second`: date histogram over selected time range.
- `GET /analytics/by-level`: terms aggregation on `level`.
- `GET /analytics/by-service`: terms aggregation on `service`.
- `GET /health`: health status for backend, RabbitMQ, Elasticsearch.

### Dashboard

Purpose: demonstrate live ingestion, search, and analytics visually.

Core screens:

- Overview dashboard with charts.
- Live log tail panel.
- Search/filter panel.
- Recent errors table.

Core widgets:

- Logs per second line chart.
- Level distribution chart.
- Top services chart.
- Live log stream.
- Search results table.

Behavior:

- Live logs update over WebSocket.
- Aggregations refresh every 3-5 seconds.
- User can filter by time range, level, service, host, and message text.

## Data Model

Normalized log event:

```json
{
  "timestamp": "2026-06-08T12:00:00.000Z",
  "receivedAt": "2026-06-08T12:00:00.120Z",
  "level": "error",
  "service": "payment-api",
  "host": "server-01",
  "message": "Payment gateway timeout",
  "metadata": {
    "requestId": "req_123",
    "statusCode": 504
  }
}
```

Required fields:

- `timestamp`
- `level`
- `service`
- `host`
- `message`

Allowed levels:

- `debug`
- `info`
- `warn`
- `error`
- `fatal`

## Error Handling

Agent:

- If backend is unavailable, buffer events in memory and retry connection.
- If buffer is full, drop oldest events and log a warning.
- If a line cannot be parsed, send it as `message` with `level: info` unless a level can be inferred.

Gateway:

- Invalid schema: reject and return validation error to agent.
- RabbitMQ unavailable: keep connection unhealthy, reject ingestion, surface status on `/health`.

Worker:

- Elasticsearch transient failure: retry with backoff.
- Permanent mapping/schema failure: route message to `logs.dlq`.
- Partial bulk failure: retry failed items only when possible.

Dashboard:

- Query failure: show non-blocking error state and allow retry.
- WebSocket disconnect: show disconnected badge and reconnect.

## Backpressure Strategy

- Gateway publishes to RabbitMQ instead of indexing directly.
- RabbitMQ buffers bursts when Elasticsearch is slow.
- Worker uses manual ack and prefetch to control indexing pressure.
- Agent has bounded local buffer to tolerate brief backend outages.
- DLQ isolates poison messages from healthy flow.

## Testing Strategy

Unit tests:

- Log parser.
- Event schema validation.
- Elasticsearch query builder.
- RabbitMQ publish/consume wrappers.

Integration tests:

- Gateway publishes valid events to RabbitMQ.
- Worker indexes consumed events into Elasticsearch.
- Search API returns expected filtered logs.
- Aggregation API returns expected buckets.

End-to-end/demo tests:

- Start Docker Compose.
- Run log generator or agent against a sample file.
- Confirm dashboard receives live logs.
- Confirm search and charts update.

## Project Structure

Suggested root directory: `real-time-log-analytics/`.

```text
real-time-log-analytics/
  apps/
    api/                 # NestJS gateway + query API
    worker/              # NestJS indexer worker
    dashboard/           # React dashboard
    agent/               # Node.js CLI log agent
  infra/
    docker-compose.yml
    elasticsearch/
    rabbitmq/
  docs/
    architecture.md
    demo-script.md
  sample-logs/
  README.md
```

## Delivery Plan

Week 1:

- Scaffold monorepo.
- Add Docker Compose for RabbitMQ and Elasticsearch.
- Build basic agent file tailing.
- Build WebSocket ingestion gateway.

Week 2:

- Add RabbitMQ publisher/consumer.
- Build indexer worker.
- Add Elasticsearch mapping and bulk indexing.
- Add search and aggregation APIs.

Week 3:

- Build React dashboard.
- Add live log stream.
- Add filters and charts.
- Add sample log generator.

Week 4:

- Add retries, DLQ, health checks.
- Optimize Elasticsearch queries.
- Add tests.
- Write README, architecture doc, and demo script.

## MVP Done Criteria

- Agent streams real appended log lines from a file.
- Backend accepts agent logs over WebSocket.
- RabbitMQ buffers logs before indexing.
- Worker bulk indexes logs into Elasticsearch.
- Search API filters by time, level, service, host, and message text.
- Aggregation APIs return logs/sec, level distribution, and top services.
- Dashboard shows live logs and charts.
- Docker Compose can run dependencies locally.
- README explains architecture, backpressure, search optimization, and demo steps.

## Roadmap

- Replace RabbitMQ with Kafka for partitioned event streams.
- Rewrite agent in Go for lower memory footprint and better deployment story.
- Add gRPC streaming protocol.
- Add alert rules for error rate and keyword matches.
- Add auth and project isolation.
- Add index lifecycle management and retention policy.
- Add metrics ingestion after log pipeline is stable.
