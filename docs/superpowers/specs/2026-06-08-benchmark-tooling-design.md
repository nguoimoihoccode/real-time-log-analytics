# Benchmark Tooling Design

Date: 2026-06-08

## Goal

Add repeatable local benchmark tooling to measure how much load the log analytics system can handle and how much CPU/RAM it consumes during load.

## Scope

- Add k6 scripts for ingestion and query load.
- Add a lightweight HTTP ingestion endpoint for benchmark clients that cannot speak Socket.IO cleanly.
- Add API runtime memory endpoint.
- Add shell scripts to run load and capture Docker container resource usage.
- Document benchmark setup, commands, and metrics.

## Non-goals

- No Prometheus/Grafana stack in this phase.
- No distributed load generation.
- No production-grade metrics storage.
- No forced dependency upgrades.

## Design

### API Benchmark Endpoint

Add `POST /logs/ingest` to the API. It accepts either one normalized log event or an array of events. It validates each event with `logEventSchema`, adds `receivedAt`, publishes each valid event to RabbitMQ, and returns `{ ok: true, accepted: number }`. This endpoint reuses the same RabbitMQ publishing path as Socket.IO ingestion, so it tests the same queue/backpressure path.

### API Memory Endpoint

Add `GET /health/memory`. It returns `process.memoryUsage()`, `process.uptime()`, and `process.pid`. This measures API process memory independently from container-level memory.

### k6 Scripts

- `benchmarks/k6/ingest-http.js`: sends JSON log events to `POST /logs/ingest` with configurable VUs, duration, and batch size.
- `benchmarks/k6/search.js`: queries `/logs/search` and analytics endpoints under concurrent read load.

Both scripts emit standard k6 metrics: requests/sec, latency percentiles, failure rate, and checks.

### Resource Capture

Add `benchmarks/scripts/collect-stats.sh`. It samples `docker stats --no-stream` for RabbitMQ, Elasticsearch, API, and worker containers when available. It also calls `GET /health/memory` for API memory. Results are written to `benchmarks/reports/`.

Add `benchmarks/scripts/run-load.sh`. It runs an ingest test, a search test, and resource capture around the test window.

## Success Criteria

- `npm run build` passes.
- `npm test` passes.
- k6 scripts are valid JavaScript and documented.
- Benchmark README section explains how to install k6/wrk and run load tests.
- Resource script produces a report file without requiring Prometheus.
