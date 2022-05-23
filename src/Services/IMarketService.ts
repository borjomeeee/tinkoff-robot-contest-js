import { HistoricalCandle, CandleInterval } from "../Types/Common";

export interface IMarketService {
  getCandles(options: GetCandlesOptions): Promise<HistoricalCandle[]>;
  getLastCandles(options: GetLastCandlesOptions): Promise<HistoricalCandle[]>;
}

export interface GetCandlesOptions {
  instrumentFigi: string;
  interval: CandleInterval;

  from: Date;
  to: Date;
}

export interface GetLastCandlesOptions {
  instrumentFigi: string;
  interval: CandleInterval;

  amount: number;
  from: Date;
}
