import { Candle, CandleInterval } from "./Types/Common";
import {
  IStrategy,
  MayBePromise,
  StrategyPredictAction,
} from "./Types/Strategy";

export interface ICandlesRobotStrategySignal {
  // Strategy info
  strategy: string;
  predictAction: StrategyPredictAction;

  // Instrument info
  instrumentFigi: string;
  candleInterval: CandleInterval;

  // Identification info
  time: number;
  robotId: string;
  lastCandle: Candle;
}

export interface ICandlesRobotStartOptions {
  instrumentFigi: string;
  candleInterval: CandleInterval;

  terminateAt?: number;
}

export interface ICandlesRobotConfig {
  signalReceiver: ICandlesRobotStrategySignalReceiver;
}

export interface ICandlesRobotStartOptions {
  instrumentFigi: string;
  candleInterval: CandleInterval;

  strategy: IStrategy;

  // Таймстемп когда бот должен завершить свою работу
  terminateAt?: number;
}

export interface ICandlesRobotWorkOptions {
  instrumentFigi: string;
  candleInterval: CandleInterval;

  strategy: IStrategy;

  finishTime: number;
}

export interface ICandlesRobotStrategySignalReceiverOptions {}
export interface ICandlesRobotStrategySignalReceiver {
  receive: (signalInfo: ICandlesRobotStrategySignal) => MayBePromise<any>;

  // For return some report information
  finishWork: () => MayBePromise<any>;
}
