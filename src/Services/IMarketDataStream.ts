import Big from "big.js";
import { Candle, SubscriptionCandleInverval } from "../Types/Common";

export interface IMarketDataStream {
  subscribeLastPrice(
    options: LastPriceSubscriptionOptions,
    fn: LastPriceSubscription
  ): () => void;

  unsubscribeLastPrice(fn: LastPriceSubscription): void;
}

export type CandleSupscription = (candle: Candle) => any;
export type LastPriceSubscription = (price: Big) => any;

export interface CandleSubscriptionOptions {
  figi: string;
  interval: SubscriptionCandleInverval;
}

export interface LastPriceSubscriptionOptions {
  figi: string;
}
