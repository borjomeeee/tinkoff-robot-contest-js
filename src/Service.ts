import { TinkoffApiClient } from "./TinkoffApiClient";

export interface ITinkoffApiClientServiceConfig {
  client: TinkoffApiClient;
  isSandbox: boolean;
}

export class TinkoffApiService {
  config: ITinkoffApiClientServiceConfig;

  constructor(options: ITinkoffApiClientServiceConfig) {
    this.config = options;
  }
}
