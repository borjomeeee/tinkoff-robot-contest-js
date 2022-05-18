import { OpenAPIClient } from "@tinkoff/invest-js";
import { CandleInterval, Instrument } from "./CommonTypes";
import { ITinkoffApiClientServiceConfig } from "./Service";
import { IStrategy } from "./Strategy";

export interface IBotConfig<T extends IStrategy<any, any>> {
  strategy: T;
  config: ITinkoffApiClientServiceConfig;

  terminateAt?: number;
}
export interface IBotStartConfig {
  instrument: Instrument;
  candleInterval: CandleInterval;
  accountId: string;
}

export interface IBot<T extends IBotStartConfig, ST extends IBotConfig<any>> {
  config: ST;

  start: (config: T) => void;
  stop: () => void;
}

export function createClient(apiToken: string) {
  return new OpenAPIClient({ token: apiToken });
}
