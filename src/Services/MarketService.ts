import { useServices } from ".";
import {
  Candle,
  CandleInterval,
  HistoricalCandle,
  Instrument,
  SubscriptionCandleInverval,
} from "../CommonTypes";
import { Logger } from "../Logger";
import { TinkoffApiService } from "../Service";
import { TimestampUtils } from "../Timestamp";
import {
  DAY_IN_MS,
  FOUR_HOURS_IN_MS,
  HOUR_IN_MS,
  QuotationUtils,
} from "../Utils";

type CandleSupscription = (candle: Candle) => any;

interface CandleSubscriptionOptions {
  instrument: Instrument;
  interval: SubscriptionCandleInverval;
}
interface MarketServiceCandleSubscription {
  sub: CandleSupscription;
  options: CandleSubscriptionOptions;
}

interface GetLastCandlesOptions {
  instrument: Instrument;
  interval: CandleInterval;

  amount: number;
  expirationDate: Date;
}

interface GetCandlesOptions {
  instrument: Instrument;
  interval: CandleInterval;

  from: Date;
  to: Date;
}

let subscriptions: MarketServiceCandleSubscription[] = [];
let marketDataStream: any | undefined = undefined;

export class MarketService extends TinkoffApiService {
  TAG = "MarketService";
  Logger = new Logger();

  subscribeCandles(fn: CandleSupscription, params: CandleSubscriptionOptions) {
    if (!marketDataStream) {
      this._openMarketDataStream();
    }

    if (!marketDataStream) {
      this.Logger.error(this.TAG, "FATAL! Market must be opened!");
      throw new Error("FATAL! Market must be opened!");
    }

    this.Logger.debug(this.TAG, `Subscribe candles: ${JSON.stringify(params)}`);
    subscriptions.push({ sub: fn, options: params });
    marketDataStream.write({
      subscribeCandlesRequest: {
        instruments: [
          {
            figi: params.instrument.figi,
            interval: params.interval,
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
              figi: subscription.options.instrument.figi,
              interval: subscription.options.interval,
            },
          ],
          subscriptionAction: "SUBSCRIPTION_ACTION_UNSUBSCRIBE",
        },
      });
    }
  }

  async getLastCandles(params: GetLastCandlesOptions) {
    const { amount, instrument, interval, expirationDate } = params;
    const step = getLastCandlesStep[interval];

    let fromDate = new Date(Date.now());
    const candles: Record<string, HistoricalCandle> = {};

    this.Logger.debug(
      this.TAG,
      `>> Get last candles with params: ${JSON.stringify(params)}`
    );

    while (fromDate >= expirationDate) {
      if (Object.keys(candles).length >= amount) {
        const data = Object.values(candles)
          .sort((candle1, candle2) => candle1.time - candle2.time)
          .slice(-amount);

        this.Logger.debug(
          this.TAG,
          `<< Get last candles with params: ${JSON.stringify(
            params
          )}\n${JSON.stringify(data)}`
        );

        return data;
      }

      const candlesList = await this.getCandles({
        from: fromDate,
        to: new Date(fromDate.getTime() + step),

        instrument,
        interval,
      });
      candlesList.forEach((candle) => (candles[candle.time] = candle));

      if (fromDate.getTime() === expirationDate.getTime()) {
        break;
      } else if (fromDate.getTime() - step < expirationDate.getTime()) {
        fromDate = new Date(expirationDate);
      } else {
        fromDate = new Date(fromDate.getTime() - step);
      }
    }

    throw new Error("FATAL! Not enought data!");
  }

  async getCandles(params: GetCandlesOptions) {
    const self = this;

    const options = {
      figi: params.instrument.figi,
      from: TimestampUtils.fromDate(params.from),
      to: TimestampUtils.fromDate(params.to),
      interval: params.interval,
    };

    this.Logger.debug(
      this.TAG,
      `>> Get candles with params: ${JSON.stringify(options)} ...`
    );

    return await new Promise<HistoricalCandle[]>((res) => {
      self.config.client.marketData.GetCandles(options, (e, v) => {
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
    marketDataStream = self.config.client.marketDataStream.marketDataStream();

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
