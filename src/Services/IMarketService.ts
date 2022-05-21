import { Candle, CandleInterval } from "../Types/Common";

export interface IMarketService {
  getCandles(options: GetCandlesOptions): Promise<Candle[]>;
  getLastCandles(options: GetLastCandlesOptions): Promise<Candle[]>;
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
