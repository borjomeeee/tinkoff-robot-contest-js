import { Instrument, TradingDay, TradingSchedule } from "../Types/Common";
import { Logger } from "../Helpers/Logger";
import { QuotationUtils, TimestampUtils } from "../Helpers/Utils";

import { InstrumentRequest } from "@tinkoff/invest-js/build/generated/tinkoff/public/invest/api/contract/v1/InstrumentRequest";

import { TinkoffApiClient } from "../TinkoffApiClient";
import {
  GetInstrumentByFigiOptions,
  GetInstrumentTradingScheduleOptions,
  IInstrumentsService,
} from "./IInsrumentsService";
import {
  GetInstrumentFatalError,
  GetTradingScheduleFatalError,
  InstrumentNotFoundError,
  TradingScheduleNotFound,
} from "../Helpers/Exceptions";

let instrumentsCache: Map<string, Instrument> = new Map();
export class TinkoffInstrumentsService implements IInstrumentsService {
  TAG = "TinkoffInstrumentsService";
  Logger = new Logger();

  private client: TinkoffApiClient;
  constructor(client: TinkoffApiClient) {
    this.client = client;
  }

  async getInstrumentByFigi(options: GetInstrumentByFigiOptions) {
    const { figi } = options;

    if (instrumentsCache.has(figi)) {
      return instrumentsCache.get(figi) as Instrument;
    }

    const request: InstrumentRequest = {
      idType: "INSTRUMENT_ID_TYPE_FIGI" as "INSTRUMENT_ID_TYPE_FIGI",
      id: figi,
      classCode: "",
    };

    return this.findInstrument(request);
  }

  async getInstrumentTradingSchedule(
    options: GetInstrumentTradingScheduleOptions
  ) {
    const self = this;
    const { exchange, from, to } = options;

    const request = {
      exchange: exchange,
      from: TimestampUtils.fromDate(from),
      to: TimestampUtils.fromDate(to),
    };

    this.Logger.debug(
      this.TAG,
      `>> Get traiding schedule with params: ${JSON.stringify(options)}`
    );

    return await new Promise<TradingSchedule>((res, rej) => {
      self.client.instruments.TradingSchedules(request, (e, v) => {
        try {
          if (e) {
            throw e;
          }

          const data = (v?.exchanges || []).map(self._parseTradingSchedule);
          if (data.length === 0) {
            rej(new TradingScheduleNotFound(exchange));
            return;
          }

          const schedule = data[0];

          this.Logger.debug(
            this.TAG,
            `<< Get traiding schedule with params: ${JSON.stringify(
              options
            )}\n${JSON.stringify(schedule)}`
          );

          res(schedule);
        } catch (e) {
          rej(new GetTradingScheduleFatalError(request, e.message));
        }
      });
    });
  }

  private async findInstrument(request: InstrumentRequest) {
    const self = this;

    this.Logger.debug(
      this.TAG,
      `>> Get instrument with params: ${JSON.stringify(request)}`
    );

    return await new Promise<Instrument>((res, rej) => {
      self.client.instruments.shareBy(request, (e, v) => {
        try {
          if (e) {
            throw e;
          }

          if (!v?.instrument) {
            rej(new InstrumentNotFoundError(request));
            return;
          }

          const data: Instrument = self._parseInstrument(v.instrument);
          instrumentsCache.set(data.figi, data);

          this.Logger.debug(
            this.TAG,
            `<< Get instrument with params: ${JSON.stringify(
              request
            )}\n${JSON.stringify(data)}`
          );

          res(data);
        } catch (e) {
          rej(new GetInstrumentFatalError(request, e.message));
        }
      });
    });
  }

  _parseTradingSchedule(feature: any): TradingSchedule {
    return {
      exchange: feature.exchange,
      days: feature.days.map(
        (day: any): TradingDay => ({
          date: day.date,
          startTime: day.startTime
            ? TimestampUtils.toDate(day.startTime).getTime()
            : undefined,
          endTime: day.endTime
            ? TimestampUtils.toDate(day.endTime).getTime()
            : undefined,
          isTraidingDay: day.isTradingDay,
        })
      ),
    };
  }

  _parseInstrument(feature: any): Instrument {
    return {
      figi: feature.figi,
      exchange: feature.exchange,
      uid: feature.uid,
      ticker: feature.ticker,

      tradable: feature.apiTradeAvailableFlag,
      lot: feature.lot,

      minPriceStep: QuotationUtils.toBig(feature.minPriceIncrement),
    };
  }
}
