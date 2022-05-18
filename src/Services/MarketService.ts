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
} from "./Types";

interface ITinkoffMarketServiceCandleSubscription {
  sub: CandleSupscription;
  options: CandleSubscriptionOptions;
}

let subscriptions: ITinkoffMarketServiceCandleSubscription[] = [];
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
    subscriptions.push({ sub: fn, options });
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
    const subscription = subscriptions.find((sub) => sub.sub === fn);
    if (!subscription) {
      return;
    }

    subscriptions = subscriptions.filter((sub) => sub !== subscription);
    if (subscriptions.length === 0) {
      this._closeMarketDataStream();
    }

    if (marketDataStream) {
      this.Logger.debug(
        this.TAG,
        `Unsubscribe candles: ${JSON.stringify(subscription.options)}`
      );
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
        subscriptions.forEach((sub) => {
          self.Logger.debug(
            self.TAG,
            `<< Get candle: ${JSON.stringify(candle)}`
          );
          sub.sub(candle);
        });
      }
    });
  }

  _closeMarketDataStream() {
    if (marketDataStream) {
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
}

const getLastCandlesStep = {
  [CandleInterval.CANDLE_INTERVAL_1_MIN]: HOUR_IN_MS,
  [CandleInterval.CANDLE_INTERVAL_5_MIN]: FOUR_HOURS_IN_MS,
};
