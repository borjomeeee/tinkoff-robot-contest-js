import { Instrument, TradingDay, TradingSchedule } from "../CommonTypes";
import { Logger } from "../Logger";
import { TinkoffApiService } from "../Service";
import { TimestampUtils } from "../Timestamp";

import { InstrumentRequest } from "@tinkoff/invest-js/build/generated/tinkoff/public/invest/api/contract/v1/InstrumentRequest";

interface TradingSchedulesOptions {
  exchange: string;

  from: Date;
  to: Date;
}

export class InstrumentsService extends TinkoffApiService {
  TAG = "InstrumentsService";
  Logger = new Logger();

  async findInstrumentByFigi(figi: string) {
    const options: InstrumentRequest = {
      idType: "INSTRUMENT_ID_TYPE_FIGI" as "INSTRUMENT_ID_TYPE_FIGI",
      id: figi,
      classCode: "",
    };

    return this.findInstrument(options);
  }

  async findInstrument(request: InstrumentRequest) {
    const self = this;

    this.Logger.debug(
      this.TAG,
      `>> Get instrument info with params: ${JSON.stringify(request)}`
    );

    return await new Promise<Instrument>((res) => {
      self.config.client.instruments.shareBy(request, (e, v) => {
        if (!e) {
          if (!v?.instrument) {
            throw new Error(
              `Get invalid data for instrument: ${JSON.stringify(request)}`
            );
          }
          const data: Instrument = self._parseInstrument(v.instrument);
          this.Logger.debug(
            this.TAG,
            `<< Get instrument info with params: ${JSON.stringify(
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

  async getTrainingSchedules(params: TradingSchedulesOptions) {
    const self = this;

    const options = {
      exchange: params.exchange,
      from: TimestampUtils.fromDate(params.from),
      to: TimestampUtils.fromDate(params.to),
    };

    this.Logger.debug(
      this.TAG,
      `>> Get traiding schedule with params: ${JSON.stringify(options)}`
    );

    return await new Promise<TradingSchedule[]>((res) => {
      self.config.client.instruments.TradingSchedules(options, (e, v) => {
        if (!e) {
          const data = (v?.exchanges || []).map(self._parseTradingSchedule);
          this.Logger.debug(
            this.TAG,
            `<< Get traiding schedule with params: ${JSON.stringify(
              options
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
          startTime: TimestampUtils.toDate(day.startTime).getTime(),
          endTime: TimestampUtils.toDate(day.endTime).getTime(),
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

      ipoDate: TimestampUtils.toDate(feature.ipoDate).getTime(),
      tradable: feature.apiTradeAvailableFlag,
    };
  }
}
