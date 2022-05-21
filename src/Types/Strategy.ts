import { Candle } from "./Common";

export enum StrategyPredictAction {
  BUY = "buy",
  SELL = "sell",
}

export interface IStrategy {
  predict: (candles: Candle[]) => StrategyPredictAction | undefined;
  getMinimalCandlesNumberToApply: () => number;

  toString: () => string;
}
