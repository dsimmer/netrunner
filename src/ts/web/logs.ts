import fs from 'fs';
import path from 'path';

const home = process.env.HOME || process.env.USERPROFILE || '';

const logsDir = path.join(home, 'logs');

const clojureLogPath = path.join(logsDir, 'jinteki-clojure.log');
const exceptionsLogPath = path.join(logsDir, 'jinteki-exceptions.log');
const modActionsLogPath = path.join(logsDir, 'jinteki-mod-actions.log');

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogContext {
  type?: 'moderator';
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: LogContext;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

function formatMessage(entry: LogEntry): string {
  const timestamp = new Date().toISOString();
  const ctxStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
  return `[${timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${ctxStr}\n`;
}

function appendToFile(filePath: string, content: string): void {
  fs.appendFileSync(filePath, content);
}

const defaultAppender = (entry: LogEntry): void => {
  if (entry.level !== 'error' && entry.level !== 'fatal' && entry.context?.type !== 'moderator') {
    appendToFile(clojureLogPath, formatMessage(entry));
  }
};

const exceptionsAppender = (entry: LogEntry): void => {
  const message = formatMessage(entry);
  console.error(message.trim());
  appendToFile(exceptionsLogPath, message);
};

const modActionAppender = (entry: LogEntry): void => {
  if (entry.context?.type === 'moderator') {
    appendToFile(modActionsLogPath, formatMessage(entry));
  }
};

function shouldLog(entryLevel: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVELS[entryLevel] >= LOG_LEVELS[minLevel];
}

export function log(entry: LogEntry): void {
  // default appender: min-level info, excludes errors/fatals/moderator
  if (shouldLog(entry.level, 'info')) {
    defaultAppender(entry);
  }
  // exceptions appender: min-level error
  if (shouldLog(entry.level, 'error')) {
    exceptionsAppender(entry);
  }
  // mod-action appender: min-level info, only moderator context
  if (shouldLog(entry.level, 'info')) {
    modActionAppender(entry);
  }
}

export function trace(message: string, context?: LogContext): void {
  log({ level: 'trace', message, context });
}

export function debug(message: string, context?: LogContext): void {
  log({ level: 'debug', message, context });
}

export function info(message: string, context?: LogContext): void {
  log({ level: 'info', message, context });
}

export function warn(message: string, context?: LogContext): void {
  log({ level: 'warn', message, context });
}

export function error(message: string, context?: LogContext): void {
  log({ level: 'error', message, context });
}

export function fatal(message: string, context?: LogContext): void {
  log({ level: 'fatal', message, context });
}

export function timbreInit(): void {
  // create logs directory
  const testPath = path.join(logsDir, 'clojure.log');
  fs.mkdirSync(path.dirname(testPath), { recursive: true });

  // clojure.log and exceptions.log can be cleaned up between each run
  if (fs.existsSync(clojureLogPath)) {
    fs.unlinkSync(clojureLogPath);
  }
  if (fs.existsSync(exceptionsLogPath)) {
    fs.unlinkSync(exceptionsLogPath);
  }

  // todo - back up the logs files or something like that
  // maybe we can actually just have an indexed html that points to different log files?
  // that would actually be sick as hell
}
