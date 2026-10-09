import type { RequestHandler } from 'express';

export type LogWriter = (line: string) => void;

const writeToConsole: LogWriter = (line) => {
  console.log(line);
};

/**
 * Logs `METHOD /path STATUS DURATIONms` for every request. The line is written when the
 * response finishes, so the status and the duration are the real ones.
 */
export function createRequestLogger(write: LogWriter = writeToConsole): RequestHandler {
  return (req, res, next) => {
    const start = performance.now();
    res.on('finish', () => {
      const path = req.originalUrl.split('?')[0] ?? req.originalUrl;
      const duration = Math.round(performance.now() - start);
      write(`${req.method} ${path} ${res.statusCode} ${duration}ms`);
    });
    next();
  };
}

export const requestLogger: RequestHandler = createRequestLogger();
