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

  commission: number;
  marketDataStream: IBacktestMarketDataStream;
}

interface IBacktesterBuildOptions {
  instrumentFigi: string;
  candleInterval: CandleInterval;

  from: Date;
  amount: number;

  services: {
    marketService: IMarketService;
    marketDataStream: IBacktestMarketDataStream;
  };

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
      services,
      instrumentFigi,
      from,
      amount,
      candleInterval,
      commission,
    } = options;
    const { marketDataStream, marketService } = services;

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

    const candlesForApply = strategy.getMinimalCandlesNumberToApply();
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
      await sleep(10);
    }
  }
}
