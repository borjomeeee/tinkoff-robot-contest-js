import { Candle } from "./Common";

export enum StrategyPredictAction {
  BUY = "buy",
  SELL = "sell",
}

export type MayBePromise<T> = Promise<T> | T;
export interface IStrategyOptions {}
export interface IStrategy {
  predict: (
    candles: Candle[]
  ) => MayBePromise<StrategyPredictAction | undefined>;
  getMinimalCandlesNumberToApply: () => number;

  toString: () => string;
}
