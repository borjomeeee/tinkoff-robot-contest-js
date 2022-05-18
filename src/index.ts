import "dotenv/config";
import { CandlesBot } from "./CandleBot";
import { CandleInterval } from "./CommonTypes";
import { useServices } from "./Services";
import { BollingerBandsStrategy } from "./Strategy";
import { TinkoffApiClient } from "./TinkoffApiClient";
import { WEEK_IN_MS } from "./Utils";

async function main() {
  if (typeof process.env.TINKOFF_API_TOKEN === "string") {
    const client = new TinkoffApiClient({
      token: process.env.TINKOFF_API_TOKEN,
    });

    const servicesConfig = { client, isSandbox: true };
    const { instrumentsService } = useServices(servicesConfig);

    const instrument = await instrumentsService.findInstrumentByFigi(
      "BBG000B9XRY4"
    );

    const bollingerBot = new CandlesBot({
      strategy: new BollingerBandsStrategy({ periods: 20, deviation: 2 }),
      config: servicesConfig,

      historyExpiration: WEEK_IN_MS,
      historyLength: 20,
    });

    bollingerBot.start({
      instrument: instrument,
      candleInterval: CandleInterval.CANDLE_INTERVAL_1_MIN,
      accountId: "MYACCOUNT",

      betLotsSize: 1,
      takeProfit: 10,
      stopLoss: 10,
    });

    setTimeout(() => bollingerBot.stop(), 5000);
  }
}
main();
