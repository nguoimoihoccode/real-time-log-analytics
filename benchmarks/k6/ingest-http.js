import http from 'k6/http';
import { check, sleep } from 'k6';

const API_URL = __ENV.API_URL || 'http://localhost:3000';
const BATCH_SIZE = Number(__ENV.BATCH_SIZE || '10');
const SERVICE_NAME = __ENV.SERVICE_NAME || 'bench-api';

export const options = {
  vus: Number(__ENV.VUS || '20'),
  duration: __ENV.DURATION || '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

const levels = ['debug', 'info', 'warn', 'error'];

function event(i) {
  const id = `${__VU}-${__ITER}-${i}`;
  return {
    timestamp: new Date().toISOString(),
    level: levels[(i + __ITER) % levels.length],
    service: SERVICE_NAME,
    host: `k6-vu-${__VU}`,
    message: `benchmark event ${id}`,
    metadata: { requestId: `bench-${id}`, path: '/bench/ingest', durationMs: Math.floor(Math.random() * 250) },
  };
}

export default function () {
  const payload = Array.from({ length: BATCH_SIZE }, (_, i) => event(i));
  const res = http.post(`${API_URL}/logs/ingest`, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'ingest status is 2xx': (r) => r.status >= 200 && r.status < 300,
    'ingest accepted batch': (r) => {
      const body = r.json();
      return body.ok === true && body.accepted === BATCH_SIZE;
    },
  });

  sleep(Number(__ENV.SLEEP_SECONDS || '0.1'));
}
