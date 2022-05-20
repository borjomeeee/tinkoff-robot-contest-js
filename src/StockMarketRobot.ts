import { v4 as uuidv4 } from "uuid";
import {
  IStockMarketRobot,
  IStockMarketRobotConfig,
  IStockMarketRobotStartOptions,
  IStockMarketRobotStrategySignal,
} from "./Bot";
import {
  CandleInterval,
  Instrument,
  OrderDirection,
  TradingDay,
} from "./CommonTypes";
import { TerminateError } from "./Exceptions";
import { Globals } from "./Globals";
import { Logger } from "./Logger";
import { StrategyPredictResult } from "./Strategy";
import {
  CandleUtils,
  DAY_IN_MS,
  FIVE_MIN_IN_MS,
  HOUR_IN_MS,
  MIN_IN_MS,
  sleep,
  Terminatable,
} from "./Utils";

interface IStockMarketWorkOptions {
  instrumentFigi: string;
  candleInterval: CandleInterval;

  onStrategySignal: (signal: IStockMarketRobotStrategySignal) => any;

  endTime: number;
}

export class StockMarketRobot implements IStockMarketRobot {
  id = "robot" + Date.now().toString();
  config: IStockMarketRobotConfig;

  TAG = "StockMarketRobot";
  Logger = new Logger();

  private terminatable = new Terminatable();
  private isRunning = false;

  constructor(config: IStockMarketRobotConfig) {
    this.config = config;
  }

  async work(options: IStockMarketWorkOptions) {
    const {
      services: { marketService },
      strategy,
      numberCandlesToApplyStrategy,
      minimalCandleTime,
    } = this.config;
    const { instrumentFigi, candleInterval, endTime, onStrategySignal } =
      options;

    const timeStep = CandleUtils.getCandleTimeStepByInterval(candleInterval);
    while (Date.now() < endTime && this.isRunning) {
      this.Logger.debug(this.TAG, `Start work iteration`);

      const lastCandles = await marketService.getLastCandles({
        instrumentFigi,
        interval: candleInterval,

        amount: numberCandlesToApplyStrategy,
        from: new Date(minimalCandleTime),
      });

      const lastCandle = lastCandles[lastCandles.length - 1];
      const lastCandleCloseTime = lastCandle.time + timeStep;

      // If last candle is not actual
      if (Date.now() - lastCandleCloseTime > timeStep) {
        await this.sleepIfRunning(Globals.tinkoffApiDdosInterval);
        continue;
      }

      const predictResult = strategy.predict(lastCandles);
      if (predictResult === StrategyPredictResult.BUY) {
        this.Logger.debug(
          this.TAG,
          `Get buy signal on candle: ${JSON.stringify(lastCandle)}`
        );

        onStrategySignal({
          orderDirection: OrderDirection.BUY,
          instrumentFigi,
          candleInterval,
          lastCandle,
          time: Date.now(),
          robotId: this.getId(),
        });
      } else if (predictResult === StrategyPredictResult.SELL) {
        this.Logger.debug(
          this.TAG,
          `Get sell signal on candle: ${JSON.stringify(lastCandle)}`
        );

        onStrategySignal({
          orderDirection: OrderDirection.SELL,
          instrumentFigi,
          candleInterval,
          lastCandle,
          time: Date.now(),
          robotId: this.getId(),
        });
      }

      // Wait for next candle
      const nextCandleOpenTime = timeStep - (Date.now() - lastCandleCloseTime);
      if (nextCandleOpenTime > 0) {
        await this.sleepIfRunning(
          nextCandleOpenTime + Globals.tinkoffApiDdosInterval
        );
      }
    }
  }

  async run(options: IStockMarketRobotStartOptions) {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    const { instrumentFigi, candleInterval, onStrategySignal, terminateAt } =
      options;
    const { instrumentsService } = this.config.services;

    this.Logger.debug(
      this.TAG,
      `Stock market robot(${this.getId()}) started with options: ${JSON.stringify(
        options
      )}`
    );

    // Stop when needed
    terminateAt && setTimeout(() => this.stop(), terminateAt - Date.now());

    try {
      const instrument = await instrumentsService.getInstrumentByFigi({
        figi: instrumentFigi,
      });

      while (this.isRunning) {
        const [currentTradingDay, nextTradingDay] =
          await this.getTradingDaysForNow(instrument);

        try {
          if (
            currentTradingDay.isTraidingDay &&
            currentTradingDay.startTime &&
            currentTradingDay.endTime
          ) {
            const nowTimeBeforeStart = Date.now();
            const timeBeforeStart = Math.min(
              currentTradingDay.startTime - nowTimeBeforeStart,
              0
            );

            // Wait for work day start
            if (timeBeforeStart > 0) {
              await this.sleepIfRunning(timeBeforeStart);
            }

            this.Logger.debug(this.TAG, `Start working day`);
            await this.work({
              instrumentFigi,
              candleInterval,

              onStrategySignal,

              endTime: currentTradingDay.endTime,
            });
            this.Logger.debug(this.TAG, `End working day`);
          }
        } catch (e) {
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
        if (nextTradingDay.startTime) {
          const endWorkTime = Date.now();
          await this.sleepIfRunning(nextTradingDay.startTime - endWorkTime);
        } else {
          await this.sleepIfRunning(12 * HOUR_IN_MS);
        }
      }
    } catch (e) {
      this.Logger.error(this.TAG, `Get error on running bot: ${e.message}`);
    }

    this.stop();
  }

  stop() {
    if (this.isRunning) {
      this.Logger.debug(
        this.TAG,
        `Stock market robot(${this.getId()}) stopped`
      );

      this.isRunning = false;
      this.terminatable.terminate();
    }
  }

  getId() {
    return this.id;
  }

  private async getTradingDaysForNow(instrument: Instrument) {
    const { instrumentsService } = this.config.services;

    const nowTime = Date.now();
    const tradingSchedule =
      await instrumentsService.getInstrumentTradingSchedule({
        from: new Date(nowTime),
        to: new Date(nowTime + DAY_IN_MS),

        exchange: instrument.exchange,
      });

    if (tradingSchedule.days.length < 2) {
      throw new Error(`FATAL! Can't get api trading schedule days!`);
    }

    // Return only today and tommorow
    return tradingSchedule.days.slice(0, 2);
  }

  private async sleepIfRunning(ms: number) {
    if (this.isRunning) {
      await sleep(ms, this.terminatable);
    } else {
      throw this.terminatable.error;
    }
  }
}
