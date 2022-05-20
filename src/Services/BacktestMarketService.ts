import { Candle } from "../CommonTypes";
import {
  CandleSubscriptionOptions,
  CandleSupscription,
  GetLastCandlesOptions,
  IMarketService,
  LastPriceSubscription,
  LastPriceSubscriptionOptions,
} from "./Types";

interface IBacktestServiveCandleSubscription {
  sub: CandleSupscription;
  options: CandleSubscriptionOptions;
}

interface IBacktestServiveLastPriceSubscription {
  sub: LastPriceSubscription;
  options: LastPriceSubscriptionOptions;
}

let candlesSubscriptions: IBacktestServiveCandleSubscription[] = [];
let lastPricesSubscriptions: IBacktestServiveLastPriceSubscription[] = [];

interface IBacktestServiceConfig {
  candleHistory: Candle[];
}

export class BacktestMarketService implements IMarketService {
  private counter = 0;
  private config: IBacktestServiceConfig;

  constructor(config: IBacktestServiceConfig) {
    this.config = config;
  }

  subscribeCandles(fn: CandleSupscription, options: CandleSubscriptionOptions) {
    candlesSubscriptions.push({ sub: fn, options });
    return fn;
  }

  unsubscribeCandles(fn: CandleSupscription) {
    candlesSubscriptions = candlesSubscriptions.filter((sub) => sub.sub !== fn);
  }

  getLastCandles(options: GetLastCandlesOptions) {
    const candles = this.config.candleHistory.slice(
      this.counter,
      options.amount + this.counter
    );

    if (this.counter < this.config.candleHistory.length) {
      this.counter += 1;
    } else {
      throw new Error("Backtest data end!");
    }

    return new Promise<Candle[]>((res) => res(candles));
  }

  getCandles() {
    return new Promise<Candle[]>((res) => res([]));
  }

  subscribeLastPrice(
    fn: LastPriceSubscription,
    options: LastPriceSubscriptionOptions
  ) {
    lastPricesSubscriptions.push({ sub: fn, options });
    return fn;
  }

  unsubscribeLastPrice(fn: LastPriceSubscription) {
    lastPricesSubscriptions = lastPricesSubscriptions.filter(
      (sub) => sub.sub !== fn
    );
  }
}
