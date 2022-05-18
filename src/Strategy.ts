import Big from "big.js";
import { Candle } from "./CommonTypes";

export enum StrategyPredictResult {
  STAY,
  BUY,
  SELL,
}

export interface IStrategy {
  predict: (candles: Candle[]) => StrategyPredictResult;
}

interface BollingerBandsStrategyConfig {
  periods: number;
  deviation: number;
}

export class BollingerBandsStrategy implements IStrategy {
  config: BollingerBandsStrategyConfig;
  constructor(config: BollingerBandsStrategyConfig) {
    if (config.periods <= 0) {
      throw new Error("Number of periods must be 1 or more!");
    }

    if (config.deviation <= 0) {
      throw new Error("Number of deviation must be 1 or more!");
    }

    this.config = config;
  }

  predict(candles: Candle[]) {
    const { deviation, periods } = this.config;

    try {
      const sma = this._get_sma(candles.slice(-periods, periods), periods);
      const sd = this._get_standart_deviation(
        candles.slice(-periods, periods),
        periods,
        sma
      );

      const upper_bb = sma.add(sd.mul(deviation));
      const lower_bb = sma.minus(sd.mul(deviation));

      const lastCandle = candles[candles.length - 1];
      if (lastCandle.close.gte(upper_bb)) {
        return StrategyPredictResult.BUY;
      } else if (lastCandle.close.lte(lower_bb)) {
        return StrategyPredictResult.SELL;
      }
    } catch (ignored) {}

    return StrategyPredictResult.STAY;
  }

  _get_sma(candles: Candle[], periods: number) {
    if (periods === 0) {
      throw new Error("Number of periods must be 1 and more!");
    }

    if (candles.length !== periods) {
      throw new Error("Number of candles must be same with number of periods!");
    }

    return candles
      .reduce((acc, candle) => acc.add(candle.close), Big(0))
      .div(periods);
  }

  _get_standart_deviation(candles: Candle[], periods: number, sma: Big) {
    let sum = Big(0);
    candles.forEach((candle) => {
      sum = sum.add(sma.minus(candle.close).pow(2));
    });
    return sum.div(periods).sqrt();
  }
}
