import { IServices } from "../Services/IServices";
import {
  IStockMarketRobotStrategySignalReceiver,
  IStockMarketRobotStrategySignalReceiverOptions,
} from "../StockMarketRobotTypes";
import { SampleSignalResolver } from "./SampleSignalResolver";

export type SignalReceiverConstructor<
  T extends IStockMarketRobotStrategySignalReceiverOptions
> = new (
  options: T,
  services: IServices
) => IStockMarketRobotStrategySignalReceiver;

export const SignalReceivers: Record<string, SignalReceiverConstructor<any>> = {
  SampleSignalResolver: SampleSignalResolver,
};
