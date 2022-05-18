export enum LoggerLevel {
  DEBUG,
  WARN,
  ERROR,
}
export interface ILogger {
  level: LoggerLevel;
  warn: (tag: string, message: string) => void;
  debug: (tag: string, message: string) => void;
  error: (tag: string, message: string) => void;
}

export class Logger implements ILogger {
  level: LoggerLevel;
  constructor(level: LoggerLevel = LoggerLevel.DEBUG) {
    this.level = level;
  }

  debug(tag: string, msg: string, level = this.level) {
    if (level <= LoggerLevel.DEBUG) {
      console.log(`[DEBUG] ${new Date().toISOString()} [${tag}] ${msg}`);
    }
  }
  warn(tag: string, msg: string, level: LoggerLevel = this.level) {
    if (level <= LoggerLevel.WARN) {
      console.warn(`[WARN] ${new Date().toISOString()} [${tag}] ${msg}`);
    }
  }
  error(tag: string, msg: string, level: LoggerLevel = this.level) {
    if (level <= LoggerLevel.ERROR) {
      console.error(`[ERROR] ${new Date().toISOString()} [${tag}] ${msg}`);
    }
  }
}
