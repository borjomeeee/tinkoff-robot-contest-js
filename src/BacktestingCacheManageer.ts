import Big from "big.js";
import { existsSync, mkdirSync } from "fs";
import { open, readFile, writeFile } from "node:fs/promises";
import { Candle } from "./Types/Common";

export interface BacktestingCacheManagerOptions {
  instrumentFigi: string;
  startDate: Date;
  endDate: Date;
}

const cacheDir = "cache";

export class BacktestingCacheManager {
  has(options: BacktestingCacheManagerOptions) {
    try {
      return existsSync(this.getFilePath(options));
    } catch (e) {
      return false;
    }
  }

  async load(options: BacktestingCacheManagerOptions): Promise<Candle[]> {
    const file = await open(this.getFilePath(options), "r");
    const data = await readFile(file);

    file.close();
    return (JSON.parse(data.toString()) as any[]).map(
      (candle): Candle => ({
        open: Big(candle.open),
        close: Big(candle.close),
        low: Big(candle.low),
        high: Big(candle.high),

        time: candle.time,
      })
    );
  }

  async save(options: BacktestingCacheManagerOptions, candles: Candle[]) {
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir);
    }

    const file = await open(this.getFilePath(options), "w");
    await writeFile(file, JSON.stringify(candles));
    file.close();
  }

  private getFilePath(options: BacktestingCacheManagerOptions) {
    const { instrumentFigi, startDate, endDate } = options;
    return `${cacheDir}/${instrumentFigi}__${startDate.toISOString()}__${endDate.toISOString()}.json`;
  }
}
