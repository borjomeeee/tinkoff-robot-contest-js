import { Instrument, TradingSchedule } from "../Types/Common";

export interface IInstrumentsService {
  getInstrumentByFigi(options: GetInstrumentByFigiOptions): Promise<Instrument>;
  getInstrumentTradingSchedule(
    options: GetInstrumentTradingScheduleOptions
  ): Promise<TradingSchedule>;
}

export interface GetInstrumentByFigiOptions {
  figi: string;
}

export interface GetInstrumentTradingScheduleOptions {
  exchange: string;

  from: Date;
  to: Date;
}
