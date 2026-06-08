import { logEventSchema, normalizeLogLine } from './log-event';

const context = {
  service: 'api',
  host: 'web-1',
};

describe('normalizeLogLine', () => {
  it('normalizes a plain error line', () => {
    const event = normalizeLogLine('[ERROR] database unavailable', context);

    expect(event).toMatchObject({
      level: 'error',
      service: 'api',
      host: 'web-1',
      message: 'database unavailable',
      metadata: {},
    });
    expect(logEventSchema.parse(event)).toEqual(event);
  });

  it('normalizes a JSON warn line', () => {
    const event = normalizeLogLine(
      JSON.stringify({ level: 'warn', message: 'high memory', requestId: 'req_1' }),
      context,
    );

    expect(event).toMatchObject({
      level: 'warn',
      service: 'api',
      host: 'web-1',
      message: 'high memory',
      metadata: { requestId: 'req_1' },
    });
    expect(logEventSchema.parse(event)).toEqual(event);
  });

  it('keeps context service and host for JSON lines', () => {
    const event = normalizeLogLine(
      JSON.stringify({ level: 'info', message: 'started', service: 'spoofed', host: 'fake' }),
      context,
    );

    expect(event).toMatchObject({
      service: 'api',
      host: 'web-1',
      metadata: { service: 'spoofed', host: 'fake' },
    });
    expect(logEventSchema.parse(event)).toEqual(event);
  });
});
