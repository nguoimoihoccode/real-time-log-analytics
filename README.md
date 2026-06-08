# Real-Time Log Analytics

MVP log analytics pipeline: a local agent tails application logs, streams normalized events through a Socket.IO API, buffers ingestion in RabbitMQ, indexes events into Elasticsearch, then visualizes live search and aggregates in a Vite dashboard.

## Architecture

```text
agent -> Socket.IO API -> RabbitMQ logs.raw -> worker -> Elasticsearch logs-* -> dashboard
```

- Agent tails `sample-logs/app.log` by default and connects to `http://localhost:3000` via Socket.IO.
- API accepts realtime log events and publishes them to RabbitMQ queue `logs.raw`.
- Worker consumes `logs.raw`, indexes documents into Elasticsearch indices named `logs-*`, and uses manual ack/nack behavior for reliability.
- Dashboard connects to the API for live Socket.IO updates, search, and aggregation views.

## Run

Start infra first:

```bash
docker compose -f infra/docker-compose.yml up -d
```

Install dependencies:

```bash
npm install
```

Run services in separate terminals:

```bash
npm run dev:api
npm run dev:worker
npm run dev:agent
npm run dev:dashboard
```

Agent defaults:

```bash
LOG_FILE=./sample-logs/app.log
SERVICE_NAME=sample-api
BACKEND_WS_URL=http://localhost:3000
```

## Append Log Example

Append a new sample event while the agent is running:

```bash
printf '%s\n' "$(date -u +%Y-%m-%dT%H:%M:%S.000Z) INFO sample-api web-1 manual append path=/api/demo status=200 duration_ms=12" >> sample-logs/app.log
```

## Portfolio Highlights

- RabbitMQ backpressure: API publish detects queue pressure instead of silently dropping logs.
- Elasticsearch search/aggregations: indexed `logs-*` data supports filtering and summary metrics.
- Realtime Socket.IO: agent ingestion and dashboard updates avoid polling-only UX.
- Reliability: worker retry flow uses manual ack/nack and DLQ routing for failed messages.

## Useful URLs

- RabbitMQ management: http://localhost:15672 (`guest` / `guest`)
- Elasticsearch: http://localhost:9200
- Dashboard: http://localhost:5173
- API: http://localhost:3000

## Useful Endpoints

- `GET /logs/search` - search indexed logs.
- `POST /logs/ingest` - HTTP benchmark ingestion endpoint.
- `GET /analytics/logs-per-second` - return log throughput over time.
- `GET /analytics/by-level` - return log counts grouped by level.
- `GET /analytics/by-service` - return log counts grouped by service.
- `GET /health/memory` - return API process memory and uptime.
- Socket.IO `log` event - ingest normalized log events from the agent.

## Benchmarking

Install tools:

```bash
brew install k6 wrk
```

Start infra and services first:

```bash
docker compose -f infra/docker-compose.yml up -d
npm run dev:api
npm run dev:worker
npm run dev:dashboard
```

Run full benchmark flow:

```bash
API_URL=http://localhost:3000 VUS=20 DURATION=1m BATCH_SIZE=10 ./benchmarks/scripts/run-load.sh
```

Run only ingest load:

```bash
API_URL=http://localhost:3000 VUS=50 DURATION=2m BATCH_SIZE=20 k6 run benchmarks/k6/ingest-http.js
```

Run only query load:

```bash
API_URL=http://localhost:3000 VUS=20 DURATION=2m k6 run benchmarks/k6/search.js
```

Capture resource usage manually:

```bash
API_URL=http://localhost:3000 ./benchmarks/scripts/collect-stats.sh
```

Optional REST smoke pressure with `wrk`:

```bash
wrk -t4 -c64 -d30s 'http://localhost:3000/analytics/by-level'
```

Read these metrics:

- k6 `http_reqs` / duration: approximate request throughput.
- k6 `http_req_duration p(95)`: p95 API latency.
- k6 `http_req_failed`: failed request rate.
- `benchmarks/reports/docker-stats-*.txt`: container CPU/RAM for RabbitMQ, Elasticsearch, API, worker when containerized.
- `benchmarks/reports/api-memory-*.json`: API `rss`, `heapUsed`, `heapTotal`, `external`, `arrayBuffers`.

## Security / Maintenance Notes

- `npm audit --audit-level=moderate` reports 8 moderate advisories. Some may be fixable with non-force `npm audit fix`; remaining advisories may require major or dependency upgrades. No force fix was used.
