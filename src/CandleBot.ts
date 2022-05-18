import { IBot, IBotConfig, IBotStartConfig } from "./Bot";
import {
  Candle,
  CandleInterval,
  Instrument,
  SubscriptionCandleIntervalDict,
  TradingDay,
} from "./CommonTypes";
import { TerminateError } from "./Exceptions";
import { Globals } from "./Globals";
import { Logger } from "./Logger";
import { useServices } from "./Services";
import { ICandlesStrategy, StrategyPredictAction } from "./Strategy";
import {
  DAY_IN_MS,
  FIVE_MIN_IN_MS,
  MIN_IN_MS,
  sleep,
  Terminatable,
} from "./Utils";

export interface ICandlesBotConfig extends IBotConfig<ICandlesStrategy<any>> {
  // Интервал между временем 2-х свечей может быть категорически разным
  // Во время работы биржы, при интервале 5М, он будет 5 минут,
  // Если это начало недели то интервал между свечами может быть 2 дня
  // (Те берутся в учет выходные)
  // Но также интервал может быть еще больше если акция по какой-то причине
  // Не торговалась на бирже
  // historyExpiration - это время в мc, с помощью которой бот
  // Рассчитывает валидная ли это свеча, или нет
  // Т.е. если по апи интервал между свечами будет больше
  // historyExpiration, то эта свеча (и все до нее) учитываться не будет
  historyExpiration: number;
  historyLength: number;
}
interface ICandlesBotStartConfig extends IBotStartConfig {
  betLotsSize: number;

  takeProfit: number;
  stopLoss: number;
}

export class CandlesBot
  implements IBot<ICandlesBotStartConfig, ICandlesBotConfig>
{
  private TAG = "CandlesBot";
  private Logger = new Logger();

  config: ICandlesBotConfig;

  private current = new Terminatable();
  private subscription?: (candle: Candle) => void;

  constructor(config: ICandlesBotConfig) {
    this.config = config;
  }

  private onCandle(candle: Candle) {
    const { strategy } = this.config;
  }

  private async work(startConfig: ICandlesBotStartConfig, day: TradingDay) {
    const { strategy } = this.config;
    const { instrument, candleInterval } = startConfig;

    const beforeStart = this.getTimeLeftBeforeTradingDayStarted(day);
    if (beforeStart > 0) {
      await sleep(beforeStart, this.current);
    }

    const timeStep = candleTimeStep[candleInterval];
    while (!this.isTradingDayCompleted(day)) {
      this.Logger.debug(this.TAG, `Start work iteration`);

      const lastCandles = await this.getLastCandles(instrument, candleInterval);
      const lastCandleCloseTime =
        lastCandles[lastCandles.length - 1].time + timeStep;

      // If last candle is not actual
      if (Date.now() - lastCandleCloseTime > timeStep) {
        await sleep(Globals.tinkoffApiDdosInterval, this.current);
        continue;
      }

      const action = strategy.predict({ candles: lastCandles });
      if (action === StrategyPredictAction.BUY) {
        this.Logger.debug(this.TAG, "BUY!!!");
      } else if (action === StrategyPredictAction.SELL) {
        this.Logger.debug(this.TAG, "SELL!!!");
      }

      const nextCandleOpenTime = timeStep - (Date.now() - lastCandleCloseTime);
      if (nextCandleOpenTime > 0) {
        // Wait for next candle
        await sleep(
          nextCandleOpenTime + Globals.tinkoffApiDdosInterval,
          this.current
        );
      }
    }
  }

  private async runSession(startConfig: ICandlesBotStartConfig) {
    const { instrument } = startConfig;

    while (!this.isSessionExpired()) {
      const [currentTradingDay, nextTradingDay] =
        await this.getTradingDaysForNow(instrument);

      try {
        if (currentTradingDay.isTraidingDay) {
          this.Logger.debug(this.TAG, `Start working day`);
          await this.work(startConfig, currentTradingDay);
          this.Logger.debug(this.TAG, `End working day`);
        }
      } catch (e) {
        // Work was terminated by user
        if (e instanceof TerminateError) {
          this.Logger.debug(
            this.TAG,
            `Bot was terminated by user at time: ${Date.now()}`
          );
          return;
        }

        throw e;
      }

      // Wait for next trading day
      const endWorkTime = Date.now();
      await sleep(nextTradingDay.startTime - endWorkTime, this.current);
    }
  }

  private async stopSession() {
    this.current.terminate();
    this.current.reset();
  }

  async start(startConfig: ICandlesBotStartConfig) {
    const { config } = this.config;
    const { instrument, candleInterval } = startConfig;

    const { marketService } = useServices(config);

    this.subscription = marketService.subscribeCandles(
      this.onCandle.bind(this),
      {
        instrument: instrument,
        interval: SubscriptionCandleIntervalDict[candleInterval],
      }
    );

    try {
      await this.runSession(startConfig);
    } catch (e) {
      this.Logger.error(this.TAG, `Get error on running bot: ${e.message}`);
    }

    if (this.subscription) {
      marketService.unsubscribeCandles(this.subscription);
    }
  }

  stop() {
    this.stopSession();
  }

  private async getLastCandles(
    instrument: Instrument,
    candleInterval: CandleInterval
  ) {
    const { config, historyExpiration, historyLength } = this.config;
    const { marketService } = useServices(config);
    const lastCandles = await marketService.getLastCandles({
      instrument,
      interval: candleInterval,

      // We need historyLength closed bars and 1 opened
      amount: historyLength + 1,
      expirationDate: new Date(Date.now() - historyExpiration),
    });

    const processedLastCandles = lastCandles
      .filter((candle) => candle.isComplete)
      .slice(-historyLength);

    if (processedLastCandles.length !== historyLength) {
      throw new Error(
        "FATAL! Number processed candles not equals to history length"
      );
    }

    return lastCandles;
  }

  private async getTradingDaysForNow(instrument: Instrument) {
    const { config } = this.config;
    const { instrumentsService } = useServices(config);

    const nowTime = Date.now();
    const tradingSchedules = await instrumentsService.getTrainingSchedules({
      from: new Date(nowTime),
      to: new Date(nowTime + DAY_IN_MS),

      exchange: instrument.exchange,
    });

    if (tradingSchedules.length === 0) {
      throw new Error(
        `FATAL! Not found trading schedules for instrument: ${JSON.stringify(
          instrument
        )}`
      );
    }
    const tradingSchedule = tradingSchedules[0];
    if (tradingSchedule.days.length < 2) {
      throw new Error(`FATAL! Can't get api trading schedule days!`);
    }

    // Return only today and tommorow
    return tradingSchedule.days.slice(0, 2);
  }

  private isSessionExpired() {
    const { terminateAt = Infinity } = this.config;
    const nowTime = Date.now();

    return nowTime >= terminateAt;
  }

  private getTimeLeftBeforeTradingDayStarted(tradingDay: TradingDay) {
    const nowTime = Date.now();
    return Math.min(tradingDay.startTime - nowTime, 0);
  }

  private isTradingDayCompleted(tradingDay: TradingDay) {
    const nowTime = Date.now();
    return nowTime >= tradingDay.endTime;
  }
}

const candleTimeStep = {
  [CandleInterval.CANDLE_INTERVAL_1_MIN]: MIN_IN_MS,
  [CandleInterval.CANDLE_INTERVAL_5_MIN]: FIVE_MIN_IN_MS,
};
