import { Candle, CandleInterval } from "./Types/Common";
import { MayBePromise, StrategyPredictAction } from "./Types/Strategy";

export interface IStockMarketRobotStrategySignal {
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

export interface IStockMarketRobotStartOptions {
  instrumentFigi: string;
  candleInterval: CandleInterval;

  onStrategySignal: (info: IStockMarketRobotStrategySignal) => void;

  terminateAt?: number;
}

export interface IStockMarketRobotStrategySignalReceiverOptions {}
export interface IStockMarketRobotStrategySignalReceiver {
  receive: (signalInfo: IStockMarketRobotStrategySignal) => MayBePromise<any>;

  // For return some report information
  finishWork: () => MayBePromise<any>;
}
