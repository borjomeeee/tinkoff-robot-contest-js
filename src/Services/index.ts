import { ITinkoffApiClientServiceConfig } from "../Service";
import { MarketService } from "./MarketService";
import { InstrumentsService } from "./InstrumentsService";

export const useServices = (config: ITinkoffApiClientServiceConfig) => {
  return {
    marketService: new MarketService(config),
    instrumentsService: new InstrumentsService(config),
  };
};
