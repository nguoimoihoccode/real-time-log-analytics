import { Client } from '@elastic/elasticsearch';
import amqp, { Channel, ConsumeMessage } from 'amqplib';
import { logEventSchema, type LogEvent } from '@rtla/shared';

type BufferedMessage = {
  message: ConsumeMessage;
  event: LogEvent;
};

export type IndexerWorkerOptions = {
  elasticsearchUrl?: string;
  rabbitmqUrl?: string;
  elasticsearch?: Client;
  flushIntervalMs?: number;
};

export class IndexerWorker {
  private readonly elasticsearch: Client;
  private readonly elasticsearchUrl: string;
  private readonly rabbitmqUrl: string;
  private readonly flushIntervalMs: number;
  private channel?: Channel;
  private buffer: BufferedMessage[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(options: IndexerWorkerOptions = {}) {
    this.elasticsearchUrl = options.elasticsearchUrl ?? process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200';
    this.elasticsearch = options.elasticsearch ?? new Client({ node: this.elasticsearchUrl });
    this.rabbitmqUrl = options.rabbitmqUrl ?? process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
    this.flushIntervalMs = options.flushIntervalMs ?? 1000;
  }

  async start(): Promise<void> {
    const connection = await amqp.connect(this.rabbitmqUrl);
    this.channel = await connection.createChannel();

    await this.channel.assertExchange('logs.dlx', 'direct', { durable: true });
    await this.channel.assertQueue('logs.raw', {
      durable: true,
      deadLetterExchange: 'logs.dlx',
    });
    this.channel.prefetch(100);
    await this.ensureIndexTemplate();
    await this.channel.consume('logs.raw', (message) => void this.handle(message), { noAck: false });

    this.flushTimer = setInterval(() => void this.flush(), this.flushIntervalMs);
  }

  async handle(message: ConsumeMessage | null): Promise<void> {
    if (!message) return;

    let payload: unknown;
    try {
      payload = JSON.parse(message.content.toString('utf8'));
    } catch {
      this.channel?.nack(message, false, false);
      return;
    }

    const parsed = logEventSchema.safeParse(payload);
    if (!parsed.success) {
      this.channel?.nack(message, false, false);
      return;
    }

    this.buffer.push({ message, event: parsed.data });
    if (this.buffer.length >= 100) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer;
    this.buffer = [];

    try {
      const operations = batch.flatMap(({ event }) => [
        { index: { _index: this.indexName(event.timestamp) } },
        event,
      ]);
      const result = await this.elasticsearch.bulk({ refresh: false, operations });

      if (result.errors) {
        for (const [index, item] of batch.entries()) {
          const bulkItem = result.items?.[index]?.index;
          const error = bulkItem?.error;
          if (!error) {
            this.channel?.ack(item.message);
          } else {
            this.channel?.nack(item.message, false, !this.isPermanentBulkError(bulkItem.status, error.type));
          }
        }
        return;
      }

      for (const item of batch) this.channel?.ack(item.message);
    } catch {
      for (const item of batch) this.channel?.nack(item.message, false, true);
    }
  }

  async ensureIndexTemplate(): Promise<void> {
    await this.elasticsearch.indices.putIndexTemplate({
      name: 'logs-template',
      index_patterns: ['logs-*'],
      template: {
        mappings: {
          properties: {
            timestamp: { type: 'date' },
            receivedAt: { type: 'date' },
            level: { type: 'keyword' },
            service: { type: 'keyword' },
            host: { type: 'keyword' },
            message: {
              type: 'text',
              fields: { keyword: { type: 'keyword', ignore_above: 256 } },
            },
            metadata: { type: 'object' },
          },
        },
      },
    });
  }

  private indexName(timestamp: string): string {
    return `logs-${timestamp.slice(0, 10).replace(/-/g, '.')}`;
  }

  private isPermanentBulkError(status?: number, type?: string): boolean {
    return status === 400 || status === 404 || type === 'mapper_parsing_exception' || type === 'illegal_argument_exception';
  }
}
