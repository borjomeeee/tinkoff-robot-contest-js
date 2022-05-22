import { IStockMarketRobotStrategySignalReceiver } from "./StockMarketRobotTypes";
import { Candle, CandleInterval } from "./Types/Common";
import { IStrategy } from "./Types/Strategy";
import { sleep } from "./Helpers/Utils";
import { IBacktestMarketDataStream } from "./Services/IBacktestMarketDataStream";
import { IMarketService } from "./Services/IMarketService";

interface IBacktesterConfig {
  instrumentFigi: string;
  candleInterval: CandleInterval;

  candlesHistory: Candle[];
  marketDataStream: IBacktestMarketDataStream;
}

interface IBacktesterBuildOptions {
  instrumentFigi: string;
  candleInterval: CandleInterval;

  from: number;
  to: number;

  commission: number;
}

interface IBacktesterBuildServices {
  marketService: IMarketService;
  marketDataStream: IBacktestMarketDataStream;
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

  static async of(
    options: IBacktesterBuildOptions,
    services: IBacktesterBuildServices
  ) {
    const { instrumentFigi, from, to, candleInterval } = options;
    const { marketDataStream, marketService } = services;

    const candlesHistory = await marketService.getCandles({
      instrumentFigi,
      from: new Date(from),
      to: new Date(to),
      interval: candleInterval,
    });

    return new Backtester({
      candlesHistory,
      instrumentFigi,
      candleInterval,
      marketDataStream,
    });
  }

  async run(options: IBacktesterRunOptions) {
    const { instrumentFigi, candleInterval, candlesHistory, marketDataStream } =
      this.config;
    const { strategy, signalReceiver } = options;

    const candlesForApply = strategy.getMinimalCandlesNumberToApply();
    for (let i = candlesForApply; i < candlesHistory.length; i++) {
      const candles = candlesHistory.slice(i, candlesForApply + i);
      const predictAction = await strategy.predict(candles);

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

      // Need to receiver make subscriptions
      await sleep(20);
    }
  }
}
