import { Candle, CandleInterval, OrderDirection } from "./CommonTypes";
import { IInstrumentsService, IMarketService } from "./Services/Types";
import { IStrategy } from "./Strategy";

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
  instrumentFigi: string;
  candleInterval: CandleInterval;

  orderDirection: OrderDirection;
  lastCandle: Candle;

  time: number;
  robotId: string;
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
