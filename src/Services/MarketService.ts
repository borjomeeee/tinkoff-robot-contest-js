import Big from "big.js";
import { Candle, CandleInterval, HistoricalCandle } from "../CommonTypes";
import { Logger } from "../Logger";
import { TimestampUtils } from "../Timestamp";
import { TinkoffApiClient } from "../TinkoffApiClient";
import {
  CandleUtils,
  FOUR_HOURS_IN_MS,
  HOUR_IN_MS,
  QuotationUtils,
} from "../Utils";
import {
  IMarketService,
  CandleSupscription,
  CandleSubscriptionOptions,
  GetLastCandlesOptions,
  GetCandlesOptions,
  LastPriceSubscription,
  LastPriceSubscriptionOptions,
} from "./Types";

const candlesSubscriptions: Map<CandleSupscription, CandleSubscriptionOptions> =
  new Map();

let lastPricesSubscriptions: Map<
  LastPriceSubscription,
  LastPriceSubscriptionOptions
> = new Map();

let marketDataStream: any | undefined = undefined;

export class TinkoffMarketService implements IMarketService {
  TAG = "TinkoffMarketService";
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

  async getLastCandles(options: GetLastCandlesOptions) {
    const { amount, instrumentFigi, interval, from } = options;

    const step = getLastCandlesStep[interval];
    const candleIntervalMs = CandleUtils.getCandleTimeStepByInterval(interval);

    this.Logger.debug(
      this.TAG,
      `>> Get last candles with params: ${JSON.stringify(options)}`
    );

    const candles: Record<string, HistoricalCandle> = {};
    let cursorDate = new Date(Date.now() - step + candleIntervalMs);

    const minCursorTime = from.getTime();
    while (cursorDate.getTime() !== minCursorTime) {
      const candlesList = await this.getCandles({
        from: cursorDate,
        to: new Date(cursorDate.getTime() + step),

        instrumentFigi,
        interval,
      });

      candlesList.forEach((candle) => (candles[candle.time] = candle));
      const completedCandlesList = Object.values(candles).filter(onlyCompleted);

      if (completedCandlesList.length >= amount) {
        const data = completedCandlesList
          .sort((candle1, candle2) => candle1.time - candle2.time)
          .slice(-amount);

        this.Logger.debug(
          this.TAG,
          `<< Get last candles with params: ${JSON.stringify(
            options
          )}\n${JSON.stringify(data)}`
        );

        return data;
      }

      cursorDate = new Date(
        Math.max(cursorDate.getTime() - step, minCursorTime)
      );
    }

    throw new Error("Not enought data on get last candles!");
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

function onlyCompleted(candle: HistoricalCandle) {
  return candle.isComplete;
}

const getLastCandlesStep = {
  [CandleInterval.CANDLE_INTERVAL_1_MIN]: HOUR_IN_MS,
  [CandleInterval.CANDLE_INTERVAL_5_MIN]: FOUR_HOURS_IN_MS,
};
