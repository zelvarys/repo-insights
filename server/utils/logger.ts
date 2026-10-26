type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, msg: string, meta?: unknown): void {
  const prefix = `[${level.toUpperCase()}]`;
  if (meta === undefined) {
    // eslint-disable-next-line no-console -- logger is the console wrapper
    console.log(`${prefix} ${msg}`);
  } else {
    // eslint-disable-next-line no-console -- logger is the console wrapper
    console.log(`${prefix} ${msg}`, meta);
  }
}

export const logger = {
  debug: (msg: string, meta?: unknown) => emit('debug', msg, meta),
  info:  (msg: string, meta?: unknown) => emit('info',  msg, meta),
  warn:  (msg: string, meta?: unknown) => emit('warn',  msg, meta),
  error: (msg: string, meta?: unknown) => emit('error', msg, meta),
};