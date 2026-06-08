import { Test } from '@nestjs/testing';
import { ElasticsearchService } from './elasticsearch.service';

const search = jest.fn();

jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn(() => ({ search })),
}));

describe('ElasticsearchService', () => {
  beforeEach(() => search.mockReset());

  it('resolves through Nest DI without Object constructor metadata', async () => {
    const module = await Test.createTestingModule({ providers: [ElasticsearchService] }).compile();

    expect(module.get(ElasticsearchService)).toBeInstanceOf(ElasticsearchService);
  });

  it('builds search query with range, filters, match, size, sort', async () => {
    search.mockResolvedValue({ hits: { hits: [] } });
    const service = new ElasticsearchService();

    await service.search({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-01T00:15:00.000Z', level: 'error', service: 'api', host: 'web-1', q: 'boom' });

    expect(search).toHaveBeenCalledWith({
      index: 'logs-*',
      size: 100,
      sort: [{ timestamp: { order: 'desc' } }],
      query: {
        bool: {
          filter: [
            { range: { timestamp: { gte: '2026-01-01T00:00:00.000Z', lte: '2026-01-01T00:15:00.000Z' } } },
            { term: { level: 'error' } },
            { term: { service: 'api' } },
            { term: { host: 'web-1' } },
          ],
          must: [{ match: { message: 'boom' } }],
        },
      },
    });
  });

  it('builds logs-per-second date histogram query', async () => {
    search.mockResolvedValue({ aggregations: {} });
    const service = new ElasticsearchService();

    await service.logsPerSecond('from', 'to');

    expect(search).toHaveBeenCalledWith({
      index: 'logs-*',
      size: 0,
      query: { range: { timestamp: { gte: 'from', lte: 'to' } } },
      aggs: { logs_per_second: { date_histogram: { field: 'timestamp', fixed_interval: '1s' } } },
    });
  });

  it('builds top terms query for allowed fields', async () => {
    search.mockResolvedValue({ aggregations: {} });
    const service = new ElasticsearchService();

    await service.terms('service');

    expect(search).toHaveBeenCalledWith({
      index: 'logs-*',
      size: 0,
      aggs: { values: { terms: { field: 'service', size: 10 } } },
    });
  });
});
