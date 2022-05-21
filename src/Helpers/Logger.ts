import { appendFile } from "fs/promises";
import { open, FileHandle } from "node:fs/promises";

export enum LoggerLevel {
  DEBUG,
  WARN,
  ERROR,
  DISABLED,
}

export interface ILogger {
  warn: (tag: string, message: string) => void;
  debug: (tag: string, message: string) => void;
  error: (tag: string, message: string) => void;
}

let file: FileHandle | undefined = undefined;
let globalLevel = LoggerLevel.DEBUG;

export class Logger implements ILogger {
  private level: LoggerLevel;

  constructor(level?: LoggerLevel) {
    this.level = level ?? globalLevel;
  }

  debug(tag: string, msg: string, level = this.level) {
    if (level <= LoggerLevel.DEBUG) {
      const logMsg = this._buildMsg("DEBUG", tag, msg);
      this.log(logMsg, console.log);
    }
  }
  warn(tag: string, msg: string, level: LoggerLevel = this.level) {
    if (level <= LoggerLevel.WARN) {
      const logMsg = this._buildMsg("WARN", tag, msg);
      this.log(logMsg, console.warn);
    }
  }
  error(tag: string, msg: string, level: LoggerLevel = this.level) {
    if (level <= LoggerLevel.ERROR) {
      const logMsg = this._buildMsg("ERROR", tag, msg);
      this.log(logMsg, console.error);
    }
  }

  async log(msg: string, writer: (str: string) => any) {
    if (file) {
      try {
        await appendFile(file, msg + "\n");
      } catch (ignored) {
        writer("FATAL! Error on log msg!");
      }
    } else {
      writer(msg);
    }
  }

  _buildMsg(level: string, tag: string, msg: string) {
    return `[${level}] ${new Date().toISOString()} [${tag}] ${msg}`;
  }

  static async setFilePath(path: string) {
    file = await open(path, "w");
  }

  static setLevel(level: LoggerLevel) {
    globalLevel = level;
  }
}
