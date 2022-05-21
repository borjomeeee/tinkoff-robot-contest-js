import { Candle, CandleInterval, OrderDirection } from "./CommonTypes";
import { IInstrumentsService, IMarketService } from "./Services/Types";
import { IStrategy, StrategyPredictAction } from "./Strategy";

export interface IStockMarketRobotConfig {
  strategy: IStrategy;

  // Сколько требуется свечей чтобы стратегия дала предикт
  numberCandlesToApplyStrategy: number;
  minimalCandleTime: number;

  services: {
    marketService: IMarketService;
    instrumentsService: IInstrumentsService;
  };
}

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

  // Таймстемп когда бот должен завершить свою работу
  terminateAt?: number;
}

export interface IStockMarketRobot {
  config: IStockMarketRobotConfig;

  run: (options: IStockMarketRobotStartOptions) => Promise<void>;
  stop: () => void;

  getId: () => string;
}

export interface IStockMarketRobotStrategySignalReceiver {
  receive: (signalInfo: IStockMarketRobotStrategySignal) => void;
}
