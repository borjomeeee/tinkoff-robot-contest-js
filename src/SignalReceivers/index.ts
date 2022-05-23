import { IServices } from "../Services/IServices";
import {
  ICandlesRobotStrategySignalReceiver,
  ICandlesRobotStrategySignalReceiverOptions,
} from "../CandlesRobotTypes";
import { SampleSignalResolver } from "./SampleSignalResolver";

export type SignalReceiverConstructor<
  T extends ICandlesRobotStrategySignalReceiverOptions
> = new (
  options: T,
  services: IServices
) => ICandlesRobotStrategySignalReceiver;

export const SignalReceivers: Record<string, SignalReceiverConstructor<any>> = {
  SampleSignalResolver: SampleSignalResolver,
};
