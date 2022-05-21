import {
  Candle,
  CandleInterval,
  Instrument,
  OrderDirection,
} from "../CommonTypes";
import { IStrategy } from "../Strategy";

import { IStockMarketRobotStrategySignalReceiver } from "../Bot";
import { IBacktestMarketDataStream, IMarketService } from "./Types";
import { sleep } from "../Utils";

interface IBacktesterConfig {
  instrumentFigi: string;
  candleInterval: CandleInterval;

  candlesHistory: Candle[];

  marketDataStream: IBacktestMarketDataStream;
  commission: number;
}

interface IBacktesterBuildOptions {
  instrumentFigi: string;
  candleInterval: CandleInterval;

  from: Date;
  amount: number;

  marketService: IMarketService;
  marketDataStream: IBacktestMarketDataStream;

  commission: number;
}

interface IBacktesterRunOptions {
  strategy: IStrategy;
  signalReceiver: IStockMarketRobotStrategySignalReceiver;
}

export class Backtester {
  private config: IBacktesterConfig;

  constructor(config: IBacktesterConfig) {
    this.config = config;
  }

  static async of(options: IBacktesterBuildOptions) {
    const {
      marketDataStream,
      marketService,
      instrumentFigi,
      from,
      amount,
      candleInterval,
      commission,
    } = options;

    const candlesHistory = await marketService.getLastCandles({
      instrumentFigi,
      from,
      amount,
      interval: candleInterval,
    });

    return new Backtester({
      candlesHistory,
      commission,
      instrumentFigi,
      candleInterval,
      marketDataStream,
    });
  }

  async run(options: IBacktesterRunOptions) {
    const { instrumentFigi, candleInterval, candlesHistory, marketDataStream } =
      this.config;
    const { strategy, signalReceiver } = options;

    const candlesForApply = strategy.getMinimalCandlesNumber();
    for (let i = candlesForApply; i < candlesHistory.length; i++) {
      const candles = candlesHistory.slice(i, candlesForApply + i);
      const predictAction = strategy.predict(candles);

      const lastCandle = candles[candles.length - 1];

      marketDataStream.sendLastPrice(lastCandle.low, instrumentFigi);
      marketDataStream.sendLastPrice(
        lastCandle.open.gt(lastCandle.close)
          ? lastCandle.close
          : lastCandle.open,
        instrumentFigi
      );
      marketDataStream.sendLastPrice(
        lastCandle.open.gt(lastCandle.close)
          ? lastCandle.open
          : lastCandle.close,
        instrumentFigi
      );
      marketDataStream.sendLastPrice(lastCandle.high, instrumentFigi);
      // marketDataStream.sendCandle(lastCandle, instrumentFigi);

      if (predictAction) {
        signalReceiver.receive({
          instrumentFigi,
          strategy: strategy.toString(),
          predictAction,
          candleInterval,
          time: Date.now(),
          lastCandle,
          robotId: "backtester",
        });
      }

      await sleep(10);
    }
  }
}
