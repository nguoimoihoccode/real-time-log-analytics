import { Injectable } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';

type SearchParams = {
  from?: string;
  to?: string;
  level?: string;
  service?: string;
  host?: string;
  q?: string;
};

type SearchClient = { search(params: Record<string, unknown>): Promise<unknown> };

@Injectable()
export class ElasticsearchService {
  private readonly client: SearchClient = new Client({ node: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200' });

  search(params: SearchParams) {
    const filter: unknown[] = [];
    const must: unknown[] = [];

    if (params.from || params.to) {
      filter.push({ range: { timestamp: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) } } });
    }

    for (const field of ['level', 'service', 'host'] as const) {
      if (params[field]) filter.push({ term: { [field]: params[field] } });
    }

    if (params.q) must.push({ match: { message: params.q } });

    return this.client.search({
      index: 'logs-*',
      size: 100,
      sort: [{ timestamp: { order: 'desc' } }],
      query: { bool: { filter, must } },
    });
  }

  logsPerSecond(from: string, to: string) {
    return this.client.search({
      index: 'logs-*',
      size: 0,
      query: { range: { timestamp: { gte: from, lte: to } } },
      aggs: { logs_per_second: { date_histogram: { field: 'timestamp', fixed_interval: '1s' } } },
    });
  }

  terms(field: 'level' | 'service') {
    return this.client.search({
      index: 'logs-*',
      size: 0,
      aggs: { values: { terms: { field, size: 10 } } },
    });
  }
}
