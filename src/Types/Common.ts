import { Big } from "big.js";

export enum OrderDirection {
  BUY = "buy",
  SELL = "sell",
}

export interface Timestamp {
  seconds: string;
  nanos: number;
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
  CANDLE_INTERVAL_15_MIN = "CANDLE_INTERVAL_15_MIN",
  CANDLE_INTERVAL_HOUR = "CANDLE_INTERVAL_HOUR",
  CANDLE_INTERVAL_DAY = "CANDLE_INTERVAL_DAY",
}

export interface Instrument {
  figi: string;
  exchange: string;
  ticker: string;
  uid: string;

  // Лотность
  lot: number;

  // Дата выхода на биржу
  ipoDate?: number;
  // Доступность торгов через апи
  tradable: boolean;

  minPriceStep: Big;
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

  startTime?: number;
  endTime?: number;

  isTraidingDay: boolean;
}

export interface TradingSchedule {
  exchange: string;
  days: TradingDay[];
}
