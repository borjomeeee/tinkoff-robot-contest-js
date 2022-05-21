import { CandleInterval, HistoricalCandle } from "../Types/Common";
import { Logger } from "../Helpers/Logger";
import { TimestampUtils } from "../Helpers/Utils";
import { TinkoffApiClient } from "../TinkoffApiClient";
import {
  CandleUtils,
  DAY_IN_MS,
  FOUR_HOURS_IN_MS,
  HOUR_IN_MS,
  QuotationUtils,
  WEEK_IN_MS,
} from "../Helpers/Utils";
import {
  GetCandlesOptions,
  GetLastCandlesOptions,
  IMarketService,
} from "./IMarketService";

export class TinkoffMarketService implements IMarketService {
  TAG = "TinkoffMarketService";
  Logger = new Logger();

  private client: TinkoffApiClient;
  constructor(client: TinkoffApiClient) {
    this.client = client;
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
    let cursorDate = new Date(from.getTime() - step + candleIntervalMs);

    while (true) {
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

      cursorDate = new Date(cursorDate.getTime() - step);
    }
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

function onlyCompleted(candle: HistoricalCandle) {
  return candle.isComplete;
}

const getLastCandlesStep = {
  [CandleInterval.CANDLE_INTERVAL_1_MIN]: HOUR_IN_MS,
  [CandleInterval.CANDLE_INTERVAL_5_MIN]: FOUR_HOURS_IN_MS,
  [CandleInterval.CANDLE_INTERVAL_15_MIN]: DAY_IN_MS,
  [CandleInterval.CANDLE_INTERVAL_HOUR]: DAY_IN_MS,
  [CandleInterval.CANDLE_INTERVAL_DAY]: 4 * WEEK_IN_MS,
};
