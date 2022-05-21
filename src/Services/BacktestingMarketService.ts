import Big from "big.js";
import {
  IBacktestMarketDataStream,
  LastPriceSubscription,
  LastPriceSubscriptionOptions,
} from "./Types";

let lastPricesSubscriptions: Map<
  LastPriceSubscription,
  LastPriceSubscriptionOptions
> = new Map();

export class BacktestingMarketDataStream implements IBacktestMarketDataStream {
  sendLastPrice(price: Big, figi: string) {
    lastPricesSubscriptions.forEach((options, sub) => {
      if (options.figi === figi) {
        sub(price);
      }
    });
  }

  subscribeLastPrice(
    options: LastPriceSubscriptionOptions,
    fn: LastPriceSubscription
  ) {
    lastPricesSubscriptions.set(fn, options);
    return () => this.unsubscribeLastPrice(fn);
  }

  unsubscribeLastPrice(fn: LastPriceSubscription) {
    lastPricesSubscriptions.delete(fn);
  }
}
