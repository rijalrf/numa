// Logger terstruktur ringan tanpa dependensi. Format JSON satu baris di produksi (LOG_FORMAT=json),
// teks biasa saat dev. Level lewat LOG_LEVEL: debug | info | warn | error (default info).
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function configuredLevel(): Level {
  const v = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return v in ORDER ? (v as Level) : 'info';
}

function jsonMode(): boolean {
  const fmt = process.env.LOG_FORMAT;
  if (fmt) return fmt.toLowerCase() === 'json';
  return process.env.NODE_ENV === 'production';
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return { message: String(err) };
}

export function formatLog(level: Level, msg: string, fields: Record<string, unknown> = {}, now = new Date()): string {
  if (jsonMode()) return JSON.stringify({ time: now.toISOString(), level, msg, ...fields });
  const extra = Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : '';
  return `[${level}] ${msg}${extra}`;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < ORDER[configuredLevel()]) return;
  const line = formatLog(level, msg, fields);
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
};
