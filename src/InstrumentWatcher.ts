import { Candle, CandleInterval } from "./CommonTypes";
import { IMarketService } from "./Services/Types";

export interface IInstrumentWatcherConfig {
  marketService: IMarketService;
}

export interface IInstrumentWatcherWatchOptions {
  figi: string;
  candleInterval: CandleInterval;

  onCandle: (candle: Candle) => any;
}

export interface IInstrumentWatcher {
  config: IInstrumentWatcherConfig;

  watch: (options: IInstrumentWatcherWatchOptions) => void;
  stopWatch: (figi: string) => void;
}

export interface IInstrumentHistoryWatcherWatchConfig {
  figi: string;
  candleInterval: CandleInterval;

  historyLength: number;
  minimalHistoryCandleDate: number;

  onCandleHistory: (candle: Candle[]) => any;
}

export interface IInstrumentHistoryWatcher {
  config: IInstrumentHistoryWatcherWatchConfig;

  watch: (options: IInstrumentHistoryWatcherWatchConfig) => void;
  stopWatch: (figi: string) => void;
}
