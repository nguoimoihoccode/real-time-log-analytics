import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { logEventSchema, type LogEvent } from '@rtla/shared';
import { ElasticsearchService } from './elasticsearch.service';
import { RabbitmqService } from './rabbitmq.service';

type SearchQuery = {
  from?: string;
  to?: string;
  level?: string;
  service?: string;
  host?: string;
  q?: string;
};

type RangeQuery = { from?: string; to?: string };

@Controller()
export class LogsController {
  constructor(
    private readonly elasticsearch: ElasticsearchService,
    private readonly rabbitmq: RabbitmqService,
  ) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Get('health/memory')
  memory() {
    return {
      ok: true,
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    };
  }

  @Post('logs/ingest')
  ingest(@Body() body: unknown) {
    const input = Array.isArray(body) ? body : [body];
    const events: LogEvent[] = [];

    for (const item of input) {
      const parsed = logEventSchema.safeParse({ ...(item as object), receivedAt: new Date().toISOString() });
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_LOG_EVENT', accepted: events.length };
      }
      events.push(parsed.data);
    }

    try {
      for (const event of events) this.rabbitmq.publishLog(event);
      return { ok: true, accepted: events.length };
    } catch {
      return { ok: false, error: 'PUBLISH_FAILED', accepted: 0 };
    }
  }

  @Get('logs/search')
  search(@Query() query: SearchQuery) {
    return this.elasticsearch.search(query);
  }

  @Get('analytics/logs-per-second')
  logsPerSecond(@Query() query: RangeQuery) {
    const from = query.from ?? 'now-15m';
    const to = query.to ?? 'now';

    return this.elasticsearch.logsPerSecond(from, to);
  }

  @Get('analytics/by-level')
  byLevel() {
    return this.elasticsearch.terms('level');
  }

  @Get('analytics/by-service')
  byService() {
    return this.elasticsearch.terms('service');
  }
}
