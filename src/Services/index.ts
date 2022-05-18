import { ITinkoffApiClientServiceConfig } from "../Service";
import { MarketService } from "./MarketService";
import { InstrumentsService } from "./InstrumentsService";

// TODO: Move to providers
export const useServices = (config: ITinkoffApiClientServiceConfig) => {
  return {
    marketService: new MarketService(config),
    instrumentsService: new InstrumentsService(config),
  };
};
