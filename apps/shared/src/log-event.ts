import { z } from 'zod';

export const logLevels = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
export const logLevelSchema = z.enum(logLevels);

export const logEventSchema = z.object({
  timestamp: z.string().datetime(),
  level: logLevelSchema,
  service: z.string().min(1),
  host: z.string().min(1),
  message: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
  receivedAt: z.string().datetime().optional(),
});

export type LogEvent = z.infer<typeof logEventSchema>;

export type LogSourceContext = {
  service: string;
  host: string;
};

const levelPattern = /\b(debug|info|warn|warning|error|fatal)\b/i;
const leadingLevelPattern = /^\s*\[(debug|info|warn|warning|error|fatal)\]\s*/i;

export function normalizeLogLine(line: string, context: LogSourceContext): LogEvent {
  const trimmedLine = line.trim();
  const timestamp = new Date().toISOString();

  try {
    const parsed = JSON.parse(trimmedLine) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const { level, message, timestamp: jsonTimestamp, receivedAt, ...metadata } = parsed;

      return logEventSchema.parse({
        timestamp: typeof jsonTimestamp === 'string' ? jsonTimestamp : timestamp,
        level: normalizeLevel(level),
        service: context.service,
        host: context.host,
        message: typeof message === 'string' ? message : trimmedLine,
        metadata,
        receivedAt: typeof receivedAt === 'string' ? receivedAt : undefined,
      });
    }
  } catch {
    // Non-JSON log lines are normalized below.
  }

  const level = inferLevel(trimmedLine);
  const message = trimmedLine.replace(leadingLevelPattern, '');

  return logEventSchema.parse({
    timestamp,
    level,
    service: context.service,
    host: context.host,
    message,
    metadata: {},
  });
}

function normalizeLevel(value: unknown): LogEvent['level'] {
  if (typeof value !== 'string') {
    return 'info';
  }

  const level = value.toLowerCase();
  if (level === 'warning') {
    return 'warn';
  }

  return logLevels.includes(level as LogEvent['level']) ? (level as LogEvent['level']) : 'info';
}

function inferLevel(line: string): LogEvent['level'] {
  const match = line.match(levelPattern);
  return normalizeLevel(match?.[1]);
}
