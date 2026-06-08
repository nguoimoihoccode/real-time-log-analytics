# Benchmark Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local load-testing and memory/CPU measurement tooling for the log analytics pipeline.

**Architecture:** Reuse the existing API/RabbitMQ path by adding `POST /logs/ingest` for HTTP benchmark load. k6 scripts generate ingest/query pressure, while shell scripts capture Docker stats and API process memory into report files.

**Tech Stack:** NestJS, TypeScript, k6, wrk, Docker CLI, Bash.

---

## Tasks

### Task 1: API Benchmark Endpoints

**Files:**
- Modify: `apps/api/src/logs.controller.ts`
- Modify: `apps/api/src/logs.controller.spec.ts`
- Modify: `apps/api/src/rabbitmq.service.ts`

- [ ] Add `POST /logs/ingest` accepting one event or array.
- [ ] Validate with `logEventSchema`, add `receivedAt`, publish via RabbitMQ.
- [ ] Return `{ ok: true, accepted: number }` or structured validation/publish error.
- [ ] Add `GET /health/memory` with `pid`, `uptime`, `memoryUsage`.
- [ ] Add tests for single ingest, batch ingest, invalid payload, memory response.
- [ ] Run `npm test -w @rtla/api && npm run build -w @rtla/api`.

### Task 2: k6 Scripts

**Files:**
- Create: `benchmarks/k6/ingest-http.js`
- Create: `benchmarks/k6/search.js`

- [ ] Add env-driven k6 ingest script: `API_URL`, `BATCH_SIZE`, `SERVICE_NAME`.
- [ ] Generate normalized log events with varied levels/services/messages.
- [ ] Check `POST /logs/ingest` returns HTTP 201/200 and `ok: true`.
- [ ] Add search script hitting `/logs/search`, `/analytics/by-level`, `/analytics/by-service`, `/analytics/logs-per-second`.
- [ ] Include thresholds for `http_req_failed` and `http_req_duration`.

### Task 3: Resource Scripts

**Files:**
- Create: `benchmarks/scripts/collect-stats.sh`
- Create: `benchmarks/scripts/run-load.sh`
- Modify: `.gitignore`

- [ ] `collect-stats.sh` writes timestamped Docker stats + API memory JSON to `benchmarks/reports/`.
- [ ] `run-load.sh` runs ingest k6, captures stats before/after, then runs search k6.
- [ ] Add `benchmarks/reports/` to `.gitignore`.
- [ ] Make scripts executable.

### Task 4: Docs + Verification

**Files:**
- Modify: `README.md`

- [ ] Add Benchmarking section: install `k6`/`wrk`, start infra/services, run scripts.
- [ ] Explain metrics: RPS, p95 latency, failed req %, Docker MEM/CPU, API heap RSS.
- [ ] Run `npm run build && npm test && docker compose -f infra/docker-compose.yml config`.

## Self-Review

- Spec coverage: API ingest endpoint, memory endpoint, k6 scripts, Docker stats scripts, docs.
- No placeholders.
- Existing Socket.IO ingestion remains unchanged.
