import { Instrument, TradingDay, TradingSchedule } from "../CommonTypes";
import { Logger } from "../Logger";
import { TimestampUtils } from "../Timestamp";

import { InstrumentRequest } from "@tinkoff/invest-js/build/generated/tinkoff/public/invest/api/contract/v1/InstrumentRequest";
import {
  IInstrumentsService,
  GetInstrumentByFigiOptions,
  GetInstrumentTradingScheduleOptions,
} from "./Types";
import { TinkoffApiClient } from "../TinkoffApiClient";

export class TinkoffInstrumentsService implements IInstrumentsService {
  TAG = "TinkoffInstrumentsService";
  Logger = new Logger();

  private client: TinkoffApiClient;
  constructor(client: TinkoffApiClient) {
    this.client = client;
  }

  async getInstrumentByFigi(options: GetInstrumentByFigiOptions) {
    const { figi } = options;

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

    return await new Promise<TradingSchedule>((res) => {
      self.client.instruments.TradingSchedules(request, (e, v) => {
        if (!e) {
          const data = (v?.exchanges || []).map(self._parseTradingSchedule);
          if (data.length === 0) {
            throw new Error("Get trading schedule empty array!");
          }

          const schedule = data[0];

          this.Logger.debug(
            this.TAG,
            `<< Get traiding schedule with params: ${JSON.stringify(
              options
            )}\n${JSON.stringify(schedule)}`
          );

          res(schedule);
        } else {
          throw e;
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

    return await new Promise<Instrument>((res) => {
      self.client.instruments.shareBy(request, (e, v) => {
        if (!e) {
          if (!v?.instrument) {
            throw new Error(`Get undefined instrument!`);
          }

          const data: Instrument = self._parseInstrument(v.instrument);
          this.Logger.debug(
            this.TAG,
            `<< Get instrument with params: ${JSON.stringify(
              request
            )}\n${JSON.stringify(data)}`
          );

          res(data);
        } else {
          throw e;
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

      ipoDate: feature.ipoDate
        ? TimestampUtils.toDate(feature.ipoDate).getTime()
        : undefined,
      tradable: feature.apiTradeAvailableFlag,
      lot: feature.lot,
    };
  }
}
