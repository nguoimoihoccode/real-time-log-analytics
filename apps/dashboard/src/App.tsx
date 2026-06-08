import { FormEvent, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type LogEvent = {
  timestamp?: string;
  receivedAt?: string;
  level: string;
  service: string;
  host: string;
  message: string;
};

type Bucket = { key: string; doc_count: number };
type SearchResponse = { hits?: { hits?: Array<{ _source?: LogEvent }> } } | LogEvent[];
type SearchState = 'idle' | 'loading' | 'searched';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const chartMargin = { top: 8, right: 8, bottom: 0, left: -20 };

function bucketsFromResponse(value: unknown): Bucket[] {
  if (Array.isArray(value)) return value as Bucket[];
  const response = value as { aggregations?: { values?: { buckets?: Bucket[] } } };
  return response.aggregations?.values?.buckets ?? [];
}

function logsFromSearch(value: SearchResponse): LogEvent[] {
  if (Array.isArray(value)) return value;
  return value.hits?.hits?.map((hit) => hit._source).filter((log): log is LogEvent => Boolean(log)) ?? [];
}

export default function App() {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [levels, setLevels] = useState<Bucket[]>([]);
  const [services, setServices] = useState<Bucket[]>([]);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('');
  const [searchResults, setSearchResults] = useState<LogEvent[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [status, setStatus] = useState('Connecting');
  const [error, setError] = useState('');
  const searchController = useRef<AbortController | null>(null);

  useEffect(() => {
    const socket = io(API, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => setStatus('Live'));
    socket.on('disconnect', () => setStatus('Reconnecting'));
    socket.on('connect_error', () => setStatus('Offline'));
    socket.on('live-log', (event: LogEvent) => {
      setLogs((current) => [event, ...current].slice(0, 100));
    });

    return () => {
      socket.close();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let inFlight = false;
    let controller: AbortController | null = null;

    const loadAnalytics = async () => {
      if (inFlight) return;

      inFlight = true;
      controller = new AbortController();

      try {
        const [levelRes, serviceRes] = await Promise.all([
          fetch(`${API}/analytics/by-level`, { signal: controller.signal }),
          fetch(`${API}/analytics/by-service`, { signal: controller.signal }),
        ]);

        if (!levelRes.ok || !serviceRes.ok) throw new Error('analytics request failed');

        const [levelJson, serviceJson] = await Promise.all([levelRes.json(), serviceRes.json()]);

        if (!mounted) return;
        setLevels(bucketsFromResponse(levelJson));
        setServices(bucketsFromResponse(serviceJson));
        setError('');
      } catch (err) {
        if (!mounted || (err instanceof DOMException && err.name === 'AbortError')) return;
        setError(err instanceof Error ? err.message : 'analytics unavailable');
      } finally {
        inFlight = false;
      }
    };

    void loadAnalytics();
    const timer = window.setInterval(loadAnalytics, 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      controller?.abort();
    };
  }, []);

  useEffect(() => {
    return () => searchController.current?.abort();
  }, []);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;

    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (level) params.set('level', level);

    try {
      setSearchState('loading');
      const response = await fetch(`${API}/logs/search?${params.toString()}`, { signal: controller.signal });
      if (!response.ok) throw new Error('search request failed');

      setSearchResults(logsFromSearch(await response.json()));
      setSearchState('searched');
      setError('');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setSearchState('searched');
      setError(err instanceof Error ? err.message : 'search unavailable');
    }
  };

  const hasSearched = searchState === 'searched';
  const visibleLogs = hasSearched ? searchResults : logs;
  const emptyMessage = hasSearched ? 'No indexed logs matched this search.' : 'Awaiting log events.';

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Real-time Log Analytics</p>
          <h1>OLED observability console</h1>
          <p className="lede">Socket stream, Elasticsearch aggregations, live triage in one high-contrast surface.</p>
        </div>
        <div className="status" aria-live="polite">
          <span className={`dot ${status.toLowerCase()}`} />
          {status}
        </div>
      </header>

      {error ? <p className="alert">{error}</p> : null}

      <section className="grid" aria-label="Analytics charts">
        <ChartCard id="levels" title="Logs by level" data={levels} fill="#7dd3fc" />
        <ChartCard id="services" title="Logs by service" data={services} fill="#c084fc" />
      </section>

      <section className="panel search-panel" aria-labelledby="search-title">
        <div>
          <h2 id="search-title">Search logs</h2>
          <p>Filter indexed logs by text and level.</p>
        </div>
        <form className="search" onSubmit={search}>
          <label>
            Message
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="timeout, latency, user id" />
          </label>
          <label>
            Level
            <select value={level} onChange={(event) => setLevel(event.target.value)}>
              <option value="">Any</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
              <option value="fatal">Fatal</option>
            </select>
          </label>
          <button type="submit" disabled={searchState === 'loading'}>
            {searchState === 'loading' ? 'Searching' : 'Run search'}
          </button>
        </form>
      </section>

      <section className="panel" aria-labelledby="live-title">
        <div className="panel-heading">
          <h2 id="live-title">{hasSearched ? 'Search results' : 'Live logs'}</h2>
          <span>{visibleLogs.length} rows</span>
        </div>
        <div className="logs" role="log" aria-live="polite">
          {visibleLogs.length === 0 ? <p className="empty">{emptyMessage}</p> : null}
          {visibleLogs.map((log, index) => (
            <article className={`log ${log.level.toLowerCase()}`} key={`${log.receivedAt ?? log.timestamp ?? 'log'}-${index}`}>
              <time>{log.receivedAt ?? log.timestamp ?? 'pending'}</time>
              <strong>{log.level}</strong>
              <span>{log.service}</span>
              <span>{log.host}</span>
              <p>{log.message}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function ChartCard({ id, title, data, fill }: { id: string; title: string; data: Bucket[]; fill: string }) {
  const summaryId = `${id}-summary`;

  return (
    <section className="panel chart" aria-label={title} aria-describedby={summaryId}>
      <h2>{title}</h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={chartMargin}>
          <CartesianGrid stroke="#1f2937" vertical={false} />
          <XAxis dataKey="key" stroke="#9ca3af" tickLine={false} axisLine={false} />
          <YAxis stroke="#9ca3af" tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip cursor={{ fill: '#111827' }} contentStyle={{ background: '#050505', border: '1px solid #334155', color: '#f8fafc' }} />
          <Bar dataKey="doc_count" fill={fill} radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <table className="sr-only" id={summaryId}>
        <caption>{title} bucket summary</caption>
        <thead>
          <tr>
            <th scope="col">Bucket</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={2}>No buckets available</td>
            </tr>
          ) : (
            data.map((bucket) => (
              <tr key={bucket.key}>
                <td>{bucket.key}</td>
                <td>{bucket.doc_count}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
