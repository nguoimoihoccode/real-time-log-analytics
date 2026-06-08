import { LogsController } from './logs.controller';

describe('LogsController', () => {
  it('exposes health', () => {
    const controller = new LogsController({} as never, {} as never);

    expect(controller.health()).toEqual({ ok: true });
  });

  it('exposes process memory', () => {
    const controller = new LogsController({} as never, {} as never);

    expect(controller.memory()).toEqual({
      ok: true,
      pid: expect.any(Number),
      uptime: expect.any(Number),
      memoryUsage: expect.objectContaining({ rss: expect.any(Number), heapUsed: expect.any(Number) }),
    });
  });

  it('publishes one benchmark log event', () => {
    const rabbitmq = { publishLog: jest.fn() };
    const controller = new LogsController({} as never, rabbitmq as never);

    const result = controller.ingest({
      timestamp: '2026-06-08T12:00:00.000Z',
      level: 'info',
      service: 'bench-api',
      host: 'bench-host',
      message: 'benchmark log',
      metadata: {},
    });

    expect(result).toEqual({ ok: true, accepted: 1 });
    expect(rabbitmq.publishLog).toHaveBeenCalledWith(expect.objectContaining({ receivedAt: expect.any(String) }));
  });

  it('publishes a benchmark log batch', () => {
    const rabbitmq = { publishLog: jest.fn() };
    const controller = new LogsController({} as never, rabbitmq as never);

    const result = controller.ingest([
      { timestamp: '2026-06-08T12:00:00.000Z', level: 'info', service: 'api', host: 'h1', message: 'one', metadata: {} },
      { timestamp: '2026-06-08T12:00:01.000Z', level: 'error', service: 'api', host: 'h1', message: 'two', metadata: {} },
    ]);

    expect(result).toEqual({ ok: true, accepted: 2 });
    expect(rabbitmq.publishLog).toHaveBeenCalledTimes(2);
  });

  it('returns structured benchmark validation errors', () => {
    const rabbitmq = { publishLog: jest.fn() };
    const controller = new LogsController({} as never, rabbitmq as never);

    expect(controller.ingest({ level: 'info' })).toEqual({ ok: false, error: 'INVALID_LOG_EVENT', accepted: 0 });
    expect(rabbitmq.publishLog).not.toHaveBeenCalled();
  });

  it('passes search query params to service', async () => {
    const elasticsearch = { search: jest.fn().mockResolvedValue({ hits: { hits: [] } }) };
    const controller = new LogsController(elasticsearch as never, {} as never);

    await controller.search({ from: 'from', to: 'to', level: 'info', service: 'api', host: 'h1', q: 'ok' });

    expect(elasticsearch.search).toHaveBeenCalledWith({ from: 'from', to: 'to', level: 'info', service: 'api', host: 'h1', q: 'ok' });
  });

  it('defaults analytics range to last 15 minutes', async () => {
    const elasticsearch = { logsPerSecond: jest.fn().mockResolvedValue({ aggregations: {} }) };
    const controller = new LogsController(elasticsearch as never, {} as never);

    await controller.logsPerSecond({});

    expect(elasticsearch.logsPerSecond).toHaveBeenCalledWith('now-15m', 'now');
  });

  it('routes level and service terms analytics', async () => {
    const elasticsearch = { terms: jest.fn().mockResolvedValue({ aggregations: {} }) };
    const controller = new LogsController(elasticsearch as never, {} as never);

    await controller.byLevel();
    await controller.byService();

    expect(elasticsearch.terms).toHaveBeenCalledWith('level');
    expect(elasticsearch.terms).toHaveBeenCalledWith('service');
  });
});
