import { IngestionGateway } from './ingestion.gateway';

describe('IngestionGateway', () => {
  const validPayload = () => ({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'api',
    host: 'web-1',
    message: 'boom',
    metadata: {},
  });

  it('validates log payload, adds receivedAt, publishes, emits live-log, returns ok', () => {
    const rabbit = { publishLog: jest.fn() };
    const gateway = new IngestionGateway(rabbit as never);
    const server = { emit: jest.fn() };
    gateway.server = server as never;
    const payload = validPayload();

    const result = gateway.handleLog(payload);

    expect(result).toEqual({ ok: true });
    expect(rabbit.publishLog).toHaveBeenCalledWith(expect.objectContaining(payload));
    expect(rabbit.publishLog.mock.calls[0][0].receivedAt).toEqual(expect.any(String));
    expect(server.emit).toHaveBeenCalledWith('live-log', rabbit.publishLog.mock.calls[0][0]);
  });

  it.each([
    ['raw event', () => validPayload()],
    ['payload envelope', () => ({ payload: validPayload() })],
    ['typed envelope', () => ({ type: 'log', payload: validPayload() })],
  ])('accepts %s', (_name, makePayload) => {
    const rabbit = { publishLog: jest.fn() };
    const gateway = new IngestionGateway(rabbit as never);
    gateway.server = { emit: jest.fn() } as never;

    expect(gateway.handleLog(makePayload())).toEqual({ ok: true });
    expect(rabbit.publishLog).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
  });

  it('returns structured invalid event errors without publishing', () => {
    const rabbit = { publishLog: jest.fn() };
    const gateway = new IngestionGateway(rabbit as never);
    gateway.server = { emit: jest.fn() } as never;

    expect(gateway.handleLog({ message: '' })).toEqual({ ok: false, error: 'INVALID_LOG_EVENT' });
    expect(rabbit.publishLog).not.toHaveBeenCalled();
  });

  it('returns structured publish failure without emitting live log', () => {
    const rabbit = { publishLog: jest.fn(() => { throw new Error('backpressure'); }) };
    const gateway = new IngestionGateway(rabbit as never);
    const server = { emit: jest.fn() };
    gateway.server = server as never;

    expect(gateway.handleLog(validPayload())).toEqual({ ok: false, error: 'PUBLISH_FAILED' });
    expect(server.emit).not.toHaveBeenCalled();
  });
});
