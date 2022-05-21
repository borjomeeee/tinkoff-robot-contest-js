import Big from "big.js";
import { IMarketDataStream } from "./IMarketDataStream";

export interface IBacktestMarketDataStream extends IMarketDataStream {
  sendLastPrice(price: Big, figi: string): void;
  // sendCandle(candle: Candle, figi: string): void;
}
