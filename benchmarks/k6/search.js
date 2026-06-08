import http from 'k6/http';
import { check, sleep } from 'k6';

const API_URL = __ENV.API_URL || 'http://localhost:3000';

export const options = {
  vus: Number(__ENV.VUS || '10'),
  duration: __ENV.DURATION || '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<750'],
  },
};

export default function () {
  const endpoints = [
    '/logs/search?service=bench-api&q=benchmark',
    '/analytics/by-level',
    '/analytics/by-service',
    '/analytics/logs-per-second?from=now-15m&to=now',
  ];

  for (const endpoint of endpoints) {
    const res = http.get(`${API_URL}${endpoint}`);
    check(res, {
      [`${endpoint} status is 2xx`]: (r) => r.status >= 200 && r.status < 300,
    });
  }

  sleep(Number(__ENV.SLEEP_SECONDS || '0.2'));
}
