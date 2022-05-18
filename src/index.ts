import "dotenv/config";
import { CandleInterval } from "./CommonTypes";
import { Globals } from "./Globals";
import { Logger } from "./Logger";
import { TinkoffInstrumentsService } from "./Services/InstrumentsService";
import { TinkoffMarketService } from "./Services/MarketService";
import { StockMarketRobot } from "./StockMarketRobot";
import { BollingerBandsStrategy } from "./Strategy";
import { TinkoffApiClient } from "./TinkoffApiClient";
import { WEEK_IN_MS } from "./Utils";

async function main() {
  await Logger.setFilePath(`logs-${new Date().toISOString()}.txt`);

  if (typeof process.env.TINKOFF_API_TOKEN === "string") {
    const client = new TinkoffApiClient({
      token: process.env.TINKOFF_API_TOKEN,
    });

    const marketRobot = new StockMarketRobot({
      strategy: new BollingerBandsStrategy({ periods: 20, deviation: 2 }),
      numberCandlesToApplyStrategy: 20,
      minimalCandleTime: Date.now() - WEEK_IN_MS,
      services: {
        instrumentsService: new TinkoffInstrumentsService(client),
        marketService: new TinkoffMarketService(client),
      },
    });

    // const bollingerBot = new CandlesBot({
    //   strategy: new BollingerBandsStrategy({ periods: 20, deviation: 2 }),
    //   config: servicesConfig,

    //   historyExpiration: WEEK_IN_MS,
    //   historyLength: 20,
    // });

    marketRobot.run({
      instrumentFigi: Globals.APPL_SPBX_FIGI,
      candleInterval: CandleInterval.CANDLE_INTERVAL_1_MIN,

      onStrategySignal: console.log,
    });
  }
}
main();
