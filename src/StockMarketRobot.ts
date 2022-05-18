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
  id = uuidv4();
  config: IStockMarketRobotConfig;

  TAG = "StockMarketRobot";
  Logger = new Logger();

  private terminatable = new Terminatable();

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
    while (Date.now() < endTime) {
      this.Logger.debug(this.TAG, `Start work iteration`);

      const lastCandles = await marketService.getLastCandles({
        instrumentFigi,
        interval: candleInterval,

        amount: numberCandlesToApplyStrategy,
        from: new Date(minimalCandleTime),
      });

      const lastCandleCloseTime =
        lastCandles[lastCandles.length - 1].time + timeStep;

      // If last candle is not actual
      if (Date.now() - lastCandleCloseTime > timeStep) {
        await sleep(Globals.tinkoffApiDdosInterval, this.terminatable);
        continue;
      }

      const predictResult = strategy.predict(lastCandles);
      if (predictResult === StrategyPredictResult.BUY) {
        onStrategySignal({
          orderDirection: OrderDirection.BUY,
          instrumentFigi,
          candleInterval,
          strategy,
          time: Date.now(),
          robot: this,
        });
      } else if (predictResult === StrategyPredictResult.SELL) {
        onStrategySignal({
          orderDirection: OrderDirection.SELL,
          instrumentFigi,
          candleInterval,
          strategy,
          time: Date.now(),
          robot: this,
        });
      }

      // Wait for next candle
      const nextCandleOpenTime = timeStep - (Date.now() - lastCandleCloseTime);
      if (nextCandleOpenTime > 0) {
        await sleep(
          nextCandleOpenTime + Globals.tinkoffApiDdosInterval,
          this.terminatable
        );
      }
    }
  }

  async run(options: IStockMarketRobotStartOptions) {
    const {
      instrumentFigi,
      candleInterval,
      onStrategySignal,
      terminateAt = Infinity,
    } = options;
    const { instrumentsService } = this.config.services;

    try {
      const instrument = await instrumentsService.getInstrumentByFigi({
        figi: instrumentFigi,
      });

      while (Date.now() < terminateAt) {
        const [currentTradingDay, nextTradingDay] =
          await this.getTradingDaysForNow(instrument);

        try {
          if (currentTradingDay.isTraidingDay) {
            const nowTimeBeforeStart = Date.now();
            const timeBeforeStart = Math.min(
              currentTradingDay.startTime - nowTimeBeforeStart,
              0
            );

            // Wait for work day start
            if (timeBeforeStart > 0) {
              await sleep(timeBeforeStart, this.terminatable);
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
        const endWorkTime = Date.now();
        await sleep(nextTradingDay.startTime - endWorkTime, this.terminatable);
      }
    } catch (e) {
      this.Logger.error(this.TAG, `Get error on running bot: ${e.message}`);
    }
  }

  stop() {}

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
}
