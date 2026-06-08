import { IndexerWorker } from './indexer.worker';
import amqp from 'amqplib';

jest.mock('amqplib', () => ({
  __esModule: true,
  default: { connect: jest.fn() },
}));

const validLog = {
  timestamp: '2026-06-08T12:00:00.000Z',
  level: 'info',
  service: 'api',
  host: 'local',
  message: 'ok',
  metadata: { requestId: 'abc' },
  receivedAt: '2026-06-08T12:00:01.000Z',
};

const secondValidLog = {
  ...validLog,
  timestamp: '2026-06-09T12:00:00.000Z',
  message: 'second',
};

function createWorker(overrides: Partial<ConstructorParameters<typeof IndexerWorker>[0]> = {}) {
  const channel = {
    ack: jest.fn(),
    nack: jest.fn(),
  };
  const elasticsearch = {
    bulk: jest.fn().mockResolvedValue({ errors: false }),
    indices: { putIndexTemplate: jest.fn().mockResolvedValue({}) },
  };

  const worker = new IndexerWorker({
    elasticsearch: elasticsearch as never,
    flushIntervalMs: 60_000,
    ...overrides,
  });
  (worker as unknown as { channel: typeof channel }).channel = channel;

  return { worker, channel, elasticsearch };
}

describe('IndexerWorker', () => {
  afterEach(() => {
    delete process.env.ELASTICSEARCH_URL;
    delete process.env.RABBITMQ_URL;
  });

  it('defaults urls from env when options are absent', () => {
    process.env.ELASTICSEARCH_URL = 'http://elasticsearch:9200';
    process.env.RABBITMQ_URL = 'amqp://rabbitmq:5672';

    const worker = new IndexerWorker({ elasticsearch: {} as never });

    expect((worker as unknown as { rabbitmqUrl: string }).rabbitmqUrl).toBe('amqp://rabbitmq:5672');
    expect((worker as unknown as { elasticsearchUrl: string }).elasticsearchUrl).toBe('http://elasticsearch:9200');
  });

  it('asserts the dead letter exchange as direct on start', async () => {
    const channel = {
      assertExchange: jest.fn(),
      assertQueue: jest.fn(),
      prefetch: jest.fn(),
      consume: jest.fn(),
    };
    jest.mocked(amqp.connect).mockResolvedValueOnce({ createChannel: jest.fn().mockResolvedValue(channel) } as never);
    const { worker } = createWorker({ flushIntervalMs: 60_000 });

    await worker.start();
    clearInterval((worker as unknown as { flushTimer: NodeJS.Timeout }).flushTimer);

    expect(channel.assertExchange).toHaveBeenCalledWith('logs.dlx', 'direct', { durable: true });
  });

  it('nacks invalid messages without requeue', async () => {
    const { worker, channel } = createWorker();
    const message = { content: Buffer.from('{"level":"info"}') } as never;

    await worker.handle(message);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('nacks malformed json without requeue', async () => {
    const { worker, channel } = createWorker();
    const message = { content: Buffer.from('{') } as never;

    await worker.handle(message);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('bulk indexes valid logs to daily indexes and acks on success', async () => {
    const { worker, channel, elasticsearch } = createWorker();
    const message = { content: Buffer.from(JSON.stringify(validLog)) } as never;

    await worker.handle(message);
    await worker.flush();

    expect(elasticsearch.bulk).toHaveBeenCalledWith({
      refresh: false,
      operations: [
        { index: { _index: 'logs-2026.06.08' } },
        validLog,
      ],
    });
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('handles partial bulk results per item', async () => {
    const { worker, channel, elasticsearch } = createWorker();
    elasticsearch.bulk.mockResolvedValueOnce({
      errors: true,
      items: [
        { index: { status: 201 } },
        { index: { status: 400, error: { type: 'mapper_parsing_exception' } } },
        { index: { status: 503, error: { type: 'unavailable' } } },
      ],
    });
    const success = { content: Buffer.from(JSON.stringify(validLog)) } as never;
    const permanent = { content: Buffer.from(JSON.stringify(secondValidLog)) } as never;
    const transient = { content: Buffer.from(JSON.stringify({ ...validLog, message: 'third' })) } as never;

    await worker.handle(success);
    await worker.handle(permanent);
    await worker.handle(transient);
    await worker.flush();

    expect(channel.ack).toHaveBeenCalledWith(success);
    expect(channel.nack).toHaveBeenCalledWith(permanent, false, false);
    expect(channel.nack).toHaveBeenCalledWith(transient, false, true);
  });

  it('nacks all buffered messages with requeue when bulk throws', async () => {
    const { worker, channel, elasticsearch } = createWorker();
    elasticsearch.bulk.mockRejectedValueOnce(new Error('es down'));
    const message = { content: Buffer.from(JSON.stringify(validLog)) } as never;

    await worker.handle(message);
    await worker.flush();

    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
  });

  it('creates the logs index template mapping', async () => {
    const { worker, elasticsearch } = createWorker();

    await worker.ensureIndexTemplate();

    expect(elasticsearch.indices.putIndexTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'logs-template',
        index_patterns: ['logs-*'],
        template: expect.objectContaining({
          mappings: {
            properties: expect.objectContaining({
              timestamp: { type: 'date' },
              receivedAt: { type: 'date' },
              level: { type: 'keyword' },
              service: { type: 'keyword' },
              host: { type: 'keyword' },
              message: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
              metadata: { type: 'object' },
            }),
          },
        }),
      }),
    );
  });
});
