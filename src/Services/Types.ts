import {
  Candle,
  CandleInterval,
  Instrument,
  SubscriptionCandleInverval,
  TradingSchedule,
} from "../CommonTypes";

export interface IMarketService {
  subscribeCandles(
    fn: CandleSupscription,
    options: CandleSubscriptionOptions
  ): CandleSupscription;

  unsubscribeCandles(fn: CandleSupscription): void;

  getCandles(options: GetCandlesOptions): Promise<Candle[]>;
  getLastCandles(options: GetLastCandlesOptions): Promise<Candle[]>;
}

export interface IInstrumentsService {
  getInstrumentByFigi(options: GetInstrumentByFigiOptions): Promise<Instrument>;
  getInstrumentTradingSchedule(
    options: GetInstrumentTradingScheduleOptions
  ): Promise<TradingSchedule>;
}

export type CandleSupscription = (candle: Candle) => any;
export interface CandleSubscriptionOptions {
  figi: string;
  interval: SubscriptionCandleInverval;
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

export interface GetInstrumentByFigiOptions {
  figi: string;
}

export interface GetInstrumentTradingScheduleOptions {
  exchange: string;

  from: Date;
  to: Date;
}
