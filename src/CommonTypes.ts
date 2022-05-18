import { Big } from "big.js";

export enum OrderDirection {
  BUY = "buy",
  SELL = "sell",
}

export interface Quotation {
  units: string;
  nano: number;
}

export interface MoneyValue {
  currency: string;
  value: Big;
}

export enum SubscriptionCandleInverval {
  ONE_MINUTE = "SUBSCRIPTION_INTERVAL_ONE_MINUTE",
  FIVE_MINUTES = "SUBSCRIPTION_INTERVAL_FIVE_MINUTES",
}

export enum CandleInterval {
  CANDLE_INTERVAL_1_MIN = "CANDLE_INTERVAL_1_MIN",
  CANDLE_INTERVAL_5_MIN = "CANDLE_INTERVAL_5_MIN",
}

export const SubscriptionCandleIntervalDict: Record<
  CandleInterval,
  SubscriptionCandleInverval
> = {
  [CandleInterval.CANDLE_INTERVAL_1_MIN]: SubscriptionCandleInverval.ONE_MINUTE,
  [CandleInterval.CANDLE_INTERVAL_5_MIN]:
    SubscriptionCandleInverval.FIVE_MINUTES,
};

export interface Instrument {
  figi: string;
  exchange: string;
  ticker: string;
  uid: string;

  // Дата выхода на биржу
  ipoDate: number;
  // Доступность торгов через апи
  tradable: boolean;
}

export interface Candle {
  open: Big;
  close: Big;
  high: Big;
  low: Big;

  time: number;
}

export interface HistoricalCandle extends Candle {
  isComplete: boolean;
}

export interface TradingDay {
  date: number;

  startTime: number;
  endTime: number;

  isTraidingDay: boolean;
}

export interface TradingSchedule {
  exchange: string;
  days: TradingDay[];
}
