type Level = 'debug' | 'info' | 'warn' | 'error';

function baseLog(level: Level, message: string, fields?: Record<string, unknown>) {
  const record = {
    ts: new Date().toISOString(),
    level,
    scope: 'animated-cape-worker',
    msg: message,
    ...(fields ?? {})
  };
  const line = JSON.stringify(record);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => baseLog('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => baseLog('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => baseLog('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => baseLog('error', message, fields)
};
