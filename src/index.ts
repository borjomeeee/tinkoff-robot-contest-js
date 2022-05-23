import "dotenv/config";

import Big from "big.js";
import { CandleInterval, OrderDirection } from "./Types/Common";
import { Globals } from "./Globals";
import { Logger, LoggerLevel } from "./Helpers/Logger";

import { CandlesRobot } from "./CandlesRobot";
import { TinkoffApiClient } from "./TinkoffApiClient";
import { Backtester } from "./Backtester";
import { BacktestingOrdersService } from "./Services/BacktestingOrdersService";
import { BacktestingMarketDataStream } from "./Services/BacktestingMarketDataStream";
import { TinkoffInstrumentsService } from "./Services/TinkoffInstrumentsService";
import { TinkoffMarketService } from "./Services/TinkoffMarketService";
import { TinkoffMarketDataStream } from "./Services/TinkoffMarketDataStream";
import { TinkoffOrdersService } from "./Services/TinkoffOrdersService";
import { BollingerBandsStrategy } from "./Strategies/BollingerBands";
import { SampleSignalResolver } from "./SignalReceivers/SampleSignalResolver";
import { IServices } from "./Services/IServices";

import dayjs from "dayjs";
import { SerializableError } from "./Helpers/Exceptions";
import { showOrdersStatistic } from "./Scripts/utils";
var customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);

// TODO:
// - add comments

async function main() {
  if (typeof process.env.TINKOFF_API_TOKEN === "string") {
    const startIsoDate = new Date().toISOString();
    // await Logger.setFilePath(`logs-${startIsoDate}.txt`);

    const client = new TinkoffApiClient({
      token: process.env.TINKOFF_API_TOKEN,
      metadata: {
        "x-app-name": "borjomeeee.tinkoff-robot-contest-js",
      },
    });

    const services: IServices = {
      instrumentsService: new TinkoffInstrumentsService(client),
      marketDataStream: new TinkoffMarketDataStream(client),
      marketService: new TinkoffMarketService(client),
      ordersService: new TinkoffOrdersService({
        client,
        isSandbox: Globals.isSandbox,
      }),
    };

    const signalResolver = new SampleSignalResolver(
      {
        accountId: Globals.sandboxAccountId,

        lotsPerBet: 1,
        maxConcurrentBets: 1,

        takeProfitPercent: 0.2,
        stopLossPercent: 0.2,

        forceCloseOnFinish: false,
      },
      services
    );

    const marketRobot = new CandlesRobot(
      {
        signalReceiver: signalResolver,
      },
      services
    );

    // await marketRobot.run({
    //   strategy: new BollingerBandsStrategy({ periods: 20, deviation: 2 }),

    //   instrumentFigi: Globals.APPL_SPBX_FIGI,
    //   candleInterval: CandleInterval.CANDLE_INTERVAL_1_MIN,

    //   terminateAt: Date.now() + HOUR_IN_MS,
    // });

    // await signalResolver.finishWork();
    // const signalRealizations = signalResolver.getSignalRealizations();

    // // Save better report
    // const file = await open(`report-${startIsoDate}.json`, "w");
    // writeFile(file, JSON.stringify(signalRealizations));
    // file.close();

    // client.instruments.shares({}, (x, y) => {
    //   if (x) {
    //     console.log(x);
    //   }

    //   console.log(
    //     x,
    //     y!.instruments.filter((x) => x.ticker === "BAC")
    //   );
    // });

    // console.log(new SerializableError("helo", "world").toString());
  }
}

main();
// backtest();
// fromConfig();
