import { Candle } from "../Types/Common";
import { Logger } from "../Helpers/Logger";
import { TimestampUtils } from "../Helpers/Utils";
import { TinkoffApiClient } from "../TinkoffApiClient";
import { QuotationUtils } from "../Helpers/Utils";
import {
  CandleSubscriptionOptions,
  CandleSupscription,
  IMarketDataStream,
  LastPriceSubscription,
  LastPriceSubscriptionOptions,
} from "./IMarketDataStream";

const candlesSubscriptions: Map<CandleSupscription, CandleSubscriptionOptions> =
  new Map();

let lastPricesSubscriptions: Map<
  LastPriceSubscription,
  LastPriceSubscriptionOptions
> = new Map();

let marketDataStream: any | undefined = undefined;
export class TinkoffMarketDataStream implements IMarketDataStream {
  TAG = "TinkoffMarketDataStream";
  Logger = new Logger();

  private client: TinkoffApiClient;
  constructor(client: TinkoffApiClient) {
    this.client = client;
  }

  subscribeCandles(options: CandleSubscriptionOptions, fn: CandleSupscription) {
    if (!marketDataStream) {
      this._openMarketDataStream();
    }

    this.Logger.debug(
      this.TAG,
      `Subscribe candles: ${JSON.stringify(options)}`
    );

    marketDataStream.write({
      subscribeCandlesRequest: {
        instruments: [
          {
            figi: options.figi,
            interval: options.interval,
          },
        ],
        subscriptionAction: "SUBSCRIPTION_ACTION_SUBSCRIBE",
      },
    });

    candlesSubscriptions.set(fn, options);
    return () => this.unsubscribeCandles(fn);
  }

  unsubscribeCandles(fn: CandleSupscription) {
    const currentOptions = candlesSubscriptions.get(fn);
    if (!currentOptions) {
      return;
    }

    candlesSubscriptions.delete(fn);
    this.closeMarketDataStreamIfNeeded();

    this.Logger.debug(
      this.TAG,
      `Unsubscribe candles: ${JSON.stringify(currentOptions)}`
    );

    let usedByAnotherSub = false;
    candlesSubscriptions.forEach((options) => {
      if (
        options.figi === currentOptions.figi &&
        options.interval === currentOptions.interval
      ) {
        usedByAnotherSub = true;
      }
    });

    if (marketDataStream && !usedByAnotherSub) {
      marketDataStream.write({
        subscribeCandlesRequest: {
          instruments: [
            {
              figi: currentOptions.figi,
              interval: currentOptions.interval,
            },
          ],
          subscriptionAction: "SUBSCRIPTION_ACTION_UNSUBSCRIBE",
        },
      });
    }
  }

  subscribeLastPrice(
    options: LastPriceSubscriptionOptions,
    fn: LastPriceSubscription
  ) {
    if (!marketDataStream) {
      this._openMarketDataStream();
    }

    this.Logger.debug(
      this.TAG,
      `Subscribe last price: ${JSON.stringify(options)}`
    );

    marketDataStream.write({
      subscribeLastPriceRequest: {
        instruments: [{ figi: options.figi }],
        subscriptionAction: "SUBSCRIPTION_ACTION_SUBSCRIBE",
      },
    });

    lastPricesSubscriptions.set(fn, options);
    return () => this.unsubscribeLastPrice(fn);
  }

  unsubscribeLastPrice(fn: LastPriceSubscription) {
    const currentOptions = lastPricesSubscriptions.get(fn);
    if (!currentOptions) {
      return;
    }

    lastPricesSubscriptions.delete(fn);
    this.closeMarketDataStreamIfNeeded();

    this.Logger.debug(
      this.TAG,
      `Unsubscribe last price: ${JSON.stringify(currentOptions)}`
    );

    let usedByAnotherSub = false;
    lastPricesSubscriptions.forEach((options) => {
      if (options.figi === currentOptions.figi) {
        usedByAnotherSub = true;
      }
    });

    if (marketDataStream && !usedByAnotherSub) {
      marketDataStream.write({
        subscribeLastPriceRequest: {
          instruments: [{ figi: currentOptions.figi }],
          subscriptionAction: "SUBSCRIPTION_ACTION_UNSUBSCRIBE",
        },
      });
    }
  }

  _openMarketDataStream() {
    const self = this;

    self.Logger.debug(self.TAG, "Open marketDataStream connection");
    marketDataStream = self.client.marketDataStream.marketDataStream();

    marketDataStream.on("close", function () {
      self.Logger.debug(self.TAG, "Close marketDataStream connection");
    });

    marketDataStream.on("close", function () {
      self.Logger.debug(self.TAG, "Close marketDataStream connection");
    });

    marketDataStream.on("error", function (e: any) {
      self.Logger.error(self.TAG, `marketDataStream get error: ${e.message}`);
      throw e;
    });

    marketDataStream.on("data", function (feature: any) {
      if (feature.payload === "candle") {
        const candle = self._parseCandle(feature.candle);
        const figi = feature.figi;

        self.Logger.debug(
          self.TAG,
          `<< Get candle for figi: ${figi}\n${JSON.stringify(candle)}`
        );

        candlesSubscriptions.forEach((_, sub) => sub(candle));
      }

      if (feature.payload === "lastPrice") {
        const price = self._parseLastPrice(feature.lastPrice);
        const figi = feature.figi;

        self.Logger.debug(
          self.TAG,
          `<< Get last price for figi: ${figi}\n${price.toString()}`
        );

        lastPricesSubscriptions.forEach((_, sub) => sub(price));
      }
    });
  }

  private closeMarketDataStreamIfNeeded() {
    if (candlesSubscriptions.size === 0 && lastPricesSubscriptions.size === 0) {
      marketDataStream.destroy();
      marketDataStream = undefined;
    }
  }

  private _parseCandle(feature: any): Candle {
    return {
      open: QuotationUtils.toBig(feature.open),
      close: QuotationUtils.toBig(feature.close),
      high: QuotationUtils.toBig(feature.high),
      low: QuotationUtils.toBig(feature.low),

      time: TimestampUtils.toDate(feature.time).getTime(),
    };
  }

  private _parseLastPrice(feature: any) {
    return QuotationUtils.toBig(feature.price);
  }
}
