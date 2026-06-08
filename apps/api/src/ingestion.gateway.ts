import { MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server } from 'socket.io';
import { logEventSchema, type LogEvent } from '@rtla/shared';
import { RabbitmqService } from './rabbitmq.service';

type IngestionResult = { ok: true } | { ok: false; error: 'INVALID_LOG_EVENT' | 'PUBLISH_FAILED' };

@WebSocketGateway({ cors: true })
export class IngestionGateway {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly rabbitmq: RabbitmqService) {}

  @SubscribeMessage('log')
  handleLog(@MessageBody() payload: unknown): IngestionResult {
    const parsed = logEventSchema.safeParse({ ...this.unwrapPayload(payload), receivedAt: new Date().toISOString() });
    if (!parsed.success) return { ok: false, error: 'INVALID_LOG_EVENT' };

    const event = parsed.data;
    try {
      this.rabbitmq.publishLog(event);
    } catch {
      return { ok: false, error: 'PUBLISH_FAILED' };
    }

    this.server.emit('live-log', event);
    return { ok: true };
  }

  private unwrapPayload(payload: unknown): Partial<LogEvent> {
    if (!payload || typeof payload !== 'object') return {};
    if ('payload' in payload && (payload as { type?: unknown }).type === undefined) return (payload as { payload: Partial<LogEvent> }).payload;
    if ('payload' in payload && (payload as { type?: unknown }).type === 'log') return (payload as { payload: Partial<LogEvent> }).payload;
    return payload as Partial<LogEvent>;
  }
}
