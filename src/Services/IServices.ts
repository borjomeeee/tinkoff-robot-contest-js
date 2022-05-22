import { IInstrumentsService } from "./IInsrumentsService";
import { IMarketDataStream } from "./IMarketDataStream";
import { IMarketService } from "./IMarketService";
import { IOrdersService } from "./IOrdersService";

export interface IServices {
  marketService: IMarketService;
  marketDataStream: IMarketDataStream;

  ordersService: IOrdersService;
  instrumentsService: IInstrumentsService;
}
