import { v4 as uuidv4 } from "uuid";
import {
  IStockMarketRobotStrategySignal,
  IStockMarketRobotStrategySignalReceiver,
} from "./StockMarketRobotTypes";
import { CandleInterval, Instrument } from "./Types/Common";
import { TerminateError } from "./Helpers/Exceptions";
import { Globals } from "./Globals";
import { Logger } from "./Helpers/Logger";
import { IStrategy, StrategyPredictAction } from "./Types/Strategy";
import {
  CandleUtils,
  DAY_IN_MS,
  HOUR_IN_MS,
  SignalUtils,
  sleep,
  Terminatable,
} from "./Helpers/Utils";

import { IServices } from "./Services/IServices";

export interface IStockMarketRobotConfig {
  signalReceiver: IStockMarketRobotStrategySignalReceiver;
}

export interface IStockMarketRobotStartOptions {
  instrumentFigi: string;
  candleInterval: CandleInterval;

  strategy: IStrategy;

  // Таймстемп когда бот должен завершить свою работу
  terminateAt?: number;
}

interface IStockMarketWorkOptions {
  instrumentFigi: string;
  candleInterval: CandleInterval;

  strategy: IStrategy;

  finishTime: number;
}

export class StockMarketRobot {
  private id = "robot" + uuidv4();

  private services: IServices;
  private config: IStockMarketRobotConfig;

  TAG = "StockMarketRobot";
  Logger = new Logger();

  private terminatable = new Terminatable();
  private isRunning = false;

  private makedSignals: Map<string, IStockMarketRobotStrategySignal> =
    new Map();

  constructor(config: IStockMarketRobotConfig, services: IServices) {
    this.config = config;
    this.services = services;
  }

  private async work(options: IStockMarketWorkOptions) {
    const { marketService } = this.services;
    const { signalReceiver } = this.config;

    const { instrumentFigi, candleInterval, finishTime, strategy } = options;

    const candleIntervalTime =
      CandleUtils.getCandleTimeStepByInterval(candleInterval);

    while (Date.now() < finishTime && this.isRunning) {
      this.Logger.debug(this.TAG, `Start work iteration`);

      const lastCandles = await marketService.getLastCandles({
        instrumentFigi,
        interval: candleInterval,

        amount: strategy.getMinimalCandlesNumberToApply(),

        // to make sure we have actual data
        from: new Date(Date.now() + candleIntervalTime),
      });

      const lastCandle = lastCandles[lastCandles.length - 1];
      const lastCandleCloseTime = lastCandle.time + candleIntervalTime;

      // If last candle is not actual
      if (Date.now() - lastCandleCloseTime >= candleIntervalTime) {
        await this.sleepIfRunning(Globals.delayBeforeCandleAppears);
        continue;
      }

      const predictAction = await strategy.predict(lastCandles);
      if (predictAction) {
        const signal: IStockMarketRobotStrategySignal = {
          strategy: strategy.toString(),
          predictAction,
          instrumentFigi,
          candleInterval,
          lastCandle,
          time: Date.now(),
          robotId: this.getId(),
        };

        const signalId = SignalUtils.getId(signal);
        if (!this.makedSignals.has(signalId)) {
          this.Logger.debug(
            this.TAG,
            `Get signal to '${
              signal.predictAction
            }' on candle: ${JSON.stringify(lastCandle)}`
          );

          this.makedSignals.set(signalId, signal);
          signalReceiver.receive(signal);
        }
      }

      // Wait for next candle
      const nextCandleOpenTime =
        candleIntervalTime - (Date.now() - lastCandleCloseTime);
      if (nextCandleOpenTime > 0) {
        await this.sleepIfRunning(nextCandleOpenTime);
      }
    }
  }

  async run(options: IStockMarketRobotStartOptions) {
    const { instrumentsService } = this.services;

    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    const { instrumentFigi, candleInterval, terminateAt, strategy } = options;

    this.Logger.debug(
      this.TAG,
      `Stock market robot(${this.getId()}) started with options: ${JSON.stringify(
        options
      )}`
    );

    // Stop when needed
    if (terminateAt) {
      const remainedToTerminate = terminateAt - Date.now();
      remainedToTerminate > 0 &&
        this.sleepIfRunning(terminateAt - Date.now()).then(() => this.stop());
    }

    try {
      const instrument = await instrumentsService.getInstrumentByFigi({
        figi: instrumentFigi,
      });

      while (this.isRunning) {
        const [currentTradingDay, nextTradingDay] =
          await this.getTradingDaysForNow(instrument);

        if (
          currentTradingDay.isTraidingDay &&
          currentTradingDay.startTime &&
          currentTradingDay.endTime
        ) {
          const { startTime, endTime } = currentTradingDay;

          // Wait for work day start
          const timeBeforeStart = Math.min(startTime - Date.now(), 0);
          if (timeBeforeStart > 0) {
            await this.sleepIfRunning(timeBeforeStart);
          }

          this.Logger.debug(this.TAG, `Start working day`);
          await this.work({
            strategy,

            instrumentFigi,
            candleInterval,

            finishTime: endTime,
          });
          this.Logger.debug(this.TAG, `End working day`);
        }

        // Wait for next trading day
        if (nextTradingDay?.startTime) {
          const endWorkTime = Date.now();
          await this.sleepIfRunning(
            Math.max(nextTradingDay.startTime - endWorkTime, 0)
          );
        } else {
          await this.sleepIfRunning(12 * HOUR_IN_MS);
        }
      }
    } catch (e) {
      this.Logger.error(this.TAG, `Get error on running bot: ${e.message}`);
      throw e;
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

  makeReport() {
    return {
      signals: this.getMakedSignals(),
    };
  }

  getMakedSignals() {
    return Array.from(this.makedSignals.values()).sort(
      (signal1, signal2) => signal1.time - signal2.time
    );
  }

  private getId() {
    return this.id;
  }

  private async getTradingDaysForNow(instrument: Instrument) {
    const { instrumentsService } = this.services;

    const nowTime = Date.now();
    const tradingSchedule =
      await instrumentsService.getInstrumentTradingSchedule({
        from: new Date(nowTime),
        to: new Date(nowTime + DAY_IN_MS),

        exchange: instrument.exchange,
      });

    if (tradingSchedule.days.length === 0) {
      throw new Error(`FATAL! Can't get api trading schedule days!`);
    }

    // Return only today and tommorrow
    return tradingSchedule.days.slice(0, 2);
  }

  private async sleepIfRunning(ms: number) {
    if (this.isRunning) {
      await sleep(ms, this.terminatable);
    }
  }
}
