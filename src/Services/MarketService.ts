import Big from "big.js";
import { Candle, CandleInterval, HistoricalCandle } from "../CommonTypes";
import { Logger } from "../Logger";
import { TimestampUtils } from "../Timestamp";
import { TinkoffApiClient } from "../TinkoffApiClient";
import { FOUR_HOURS_IN_MS, HOUR_IN_MS, QuotationUtils } from "../Utils";
import {
  IMarketService,
  CandleSupscription,
  CandleSubscriptionOptions,
  GetLastCandlesOptions,
  GetCandlesOptions,
  LastPriceSubscription,
  LastPriceSubscriptionOptions,
} from "./Types";

interface ITinkoffMarketServiceCandleSubscription {
  sub: CandleSupscription;
  options: CandleSubscriptionOptions;
}

interface ITinkoffMarketServiceLastPriceSubscription {
  sub: LastPriceSubscription;
  options: LastPriceSubscriptionOptions;
}

let candlesSubscriptions: ITinkoffMarketServiceCandleSubscription[] = [];
let lastPricesSubscriptions: ITinkoffMarketServiceLastPriceSubscription[] = [];
let marketDataStream: any | undefined = undefined;

export class TinkoffMarketService implements IMarketService {
  TAG = "TinkoffMarketService";
  Logger = new Logger();

  private client: TinkoffApiClient;
  constructor(client: TinkoffApiClient) {
    this.client = client;
  }

  subscribeCandles(fn: CandleSupscription, options: CandleSubscriptionOptions) {
    if (!marketDataStream) {
      this._openMarketDataStream();
    }

    if (!marketDataStream) {
      this.Logger.error(this.TAG, "FATAL! Market must be opened!");
      throw new Error("FATAL! Market must be opened!");
    }

    this.Logger.debug(
      this.TAG,
      `Subscribe candles: ${JSON.stringify(options)}`
    );
    candlesSubscriptions.push({ sub: fn, options });
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

    return fn;
  }

  unsubscribeCandles(fn: CandleSupscription) {
    const subscription = candlesSubscriptions.find((sub) => sub.sub === fn);
    if (!subscription) {
      return;
    }

    candlesSubscriptions = candlesSubscriptions.filter(
      (sub) => sub !== subscription
    );
    this.closeMarketDataStreamIfNeeded();

    this.Logger.debug(
      this.TAG,
      `Unsubscribe candles: ${JSON.stringify(subscription.options)}`
    );

    const usedByAnotherSub = candlesSubscriptions.some(
      ({ options }) =>
        options.figi === subscription.options.figi &&
        options.interval === subscription.options.interval
    );

    if (marketDataStream && !usedByAnotherSub) {
      marketDataStream.write({
        subscribeCandlesRequest: {
          instruments: [
            {
              figi: subscription.options.figi,
              interval: subscription.options.interval,
            },
          ],
          subscriptionAction: "SUBSCRIPTION_ACTION_UNSUBSCRIBE",
        },
      });
    }
  }

  subscribeLastPrice(
    fn: LastPriceSubscription,
    options: LastPriceSubscriptionOptions
  ) {
    if (!marketDataStream) {
      this._openMarketDataStream();
    }

    if (!marketDataStream) {
      this.Logger.error(this.TAG, "FATAL! Market must be opened!");
      throw new Error("FATAL! Market must be opened!");
    }

    this.Logger.debug(
      this.TAG,
      `Subscribe last price: ${JSON.stringify(options)}`
    );
    lastPricesSubscriptions.push({ sub: fn, options });
    marketDataStream.write({
      subscribeLastPriceRequest: {
        instruments: [{ figi: options.figi }],
        subscriptionAction: "SUBSCRIPTION_ACTION_SUBSCRIBE",
      },
    });

    return fn;
  }

  unsubscribeLastPrice(fn: LastPriceSubscription) {
    const subscription = lastPricesSubscriptions.find((sub) => sub.sub === fn);
    if (!subscription) {
      return;
    }

    lastPricesSubscriptions = lastPricesSubscriptions.filter(
      (sub) => sub !== subscription
    );
    this.closeMarketDataStreamIfNeeded();

    this.Logger.debug(
      this.TAG,
      `Unsubscribe last price: ${JSON.stringify(subscription.options)}`
    );

    const usedByAnotherSub = lastPricesSubscriptions.some(
      ({ options }) => options.figi === subscription.options.figi
    );
    if (marketDataStream && !usedByAnotherSub) {
      marketDataStream.write({
        subscribeLastPriceRequest: {
          instruments: [{ figi: subscription.options.figi }],
          subscriptionAction: "SUBSCRIPTION_ACTION_UNSUBSCRIBE",
        },
      });
    }
  }

  async getLastCandles(options: GetLastCandlesOptions) {
    const { amount, instrumentFigi, interval, from } = options;
    const step = getLastCandlesStep[interval];

    let cursorDate = new Date(Date.now());
    const candles: Record<string, HistoricalCandle> = {};

    this.Logger.debug(
      this.TAG,
      `>> Get last candles with params: ${JSON.stringify(options)}`
    );

    while (cursorDate.getTime() >= from.getTime()) {
      if (
        Object.values(candles).filter((candle) => candle.isComplete).length >=
        amount
      ) {
        const data = Object.values(candles)
          .sort((candle1, candle2) => candle1.time - candle2.time)
          .filter((candle) => candle.isComplete)
          .slice(-amount);

        this.Logger.debug(
          this.TAG,
          `<< Get last candles with params: ${JSON.stringify(
            options
          )}\n${JSON.stringify(data)}`
        );

        return data;
      }

      const candlesList = await this.getCandles({
        from: cursorDate,
        to: new Date(cursorDate.getTime() + step),

        instrumentFigi,
        interval,
      });
      candlesList.forEach((candle) => (candles[candle.time] = candle));

      if (cursorDate.getTime() === from.getTime()) {
        break;
      } else if (cursorDate.getTime() - step < from.getTime()) {
        cursorDate = new Date(from);
      } else {
        cursorDate = new Date(cursorDate.getTime() - step);
      }
    }

    throw new Error("FATAL! Not enought data!");
  }

  async getCandles(options: GetCandlesOptions) {
    const self = this;
    const { instrumentFigi, from, to, interval } = options;

    const request = {
      figi: instrumentFigi,
      from: TimestampUtils.fromDate(from),
      to: TimestampUtils.fromDate(to),
      interval: interval,
    };

    this.Logger.debug(
      this.TAG,
      `>> Get candles with params: ${JSON.stringify(options)}`
    );

    return await new Promise<HistoricalCandle[]>((res) => {
      self.client.marketData.GetCandles(request, (e, v) => {
        if (!e) {
          const data = (v?.candles || []).map(self._parseHistoricalCandle);
          this.Logger.debug(
            this.TAG,
            `<< Get candles with params: ${JSON.stringify(
              options
            )}\n${JSON.stringify(data)}`
          );

          res(data);
        } else {
          throw e;
        }
      });
    });
  }

  _openMarketDataStream() {
    const self = this;

    self.Logger.debug(self.TAG, "Open marketDataStream connection");
    marketDataStream = self.client.marketDataStream.marketDataStream();

    marketDataStream.on("close", function () {
      self.Logger.debug(self.TAG, "Close marketDataStream connection");
    });

    marketDataStream.on("error", function (e: any) {
      self.Logger.error(self.TAG, `marketDataStream get error: ${e.message}`);
    });

    marketDataStream.on("data", function (feature: any) {
      if (feature.payload === "candle") {
        const candle = self._parseCandle(feature.candle);
        self.Logger.debug(self.TAG, `<< Get candle: ${JSON.stringify(candle)}`);

        candlesSubscriptions.forEach((sub) => {
          sub.sub(candle);
        });
      }

      if (feature.payload === "lastPrice") {
        const price = self._parseLastPrice(feature.lastPrice);
        self.Logger.debug(self.TAG, `<< Get last price: ${price.toString()}`);

        lastPricesSubscriptions.forEach((sub) => {
          sub.sub(price);
        });
      }
    });
  }

  private closeMarketDataStreamIfNeeded() {
    if (
      candlesSubscriptions.length === 0 &&
      lastPricesSubscriptions.length === 0
    ) {
      marketDataStream.destroy();
      marketDataStream = undefined;
    }
  }

  _parseCandle(feature: any): Candle {
    return {
      open: QuotationUtils.toBig(feature.open),
      close: QuotationUtils.toBig(feature.close),
      high: QuotationUtils.toBig(feature.high),
      low: QuotationUtils.toBig(feature.low),

      time: TimestampUtils.toDate(feature.time).getTime(),
    };
  }

  _parseHistoricalCandle(feature: any): HistoricalCandle {
    return {
      open: QuotationUtils.toBig(feature.open),
      close: QuotationUtils.toBig(feature.close),
      high: QuotationUtils.toBig(feature.high),
      low: QuotationUtils.toBig(feature.low),

      time: TimestampUtils.toDate(feature.time).getTime(),
      isComplete: feature.isComplete,
    };
  }

  _parseLastPrice(feature: any): Big {
    return QuotationUtils.toBig(feature.price);
  }
}

const getLastCandlesStep = {
  [CandleInterval.CANDLE_INTERVAL_1_MIN]: HOUR_IN_MS,
  [CandleInterval.CANDLE_INTERVAL_5_MIN]: FOUR_HOURS_IN_MS,
};
