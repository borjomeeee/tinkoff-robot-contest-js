import { IServices } from "../Services/IServices";
import { IStrategy, IStrategyOptions } from "../Types/Strategy";
import { BollingerBandsStrategy } from "./BollingerBands";

type StrategyConstructor<T extends IStrategyOptions> = new (
  options: T,
  services: IServices
) => IStrategy;

export const Strategies: Record<string, StrategyConstructor<any>> = {
  BollingerBands: BollingerBandsStrategy,
};
