import "dotenv/config";
import { CandleInterval } from "./CommonTypes";
import { Globals } from "./Globals";
import { Logger } from "./Logger";
import { TinkoffInstrumentsService } from "./Services/InstrumentsService";
import { TinkoffMarketService } from "./Services/MarketService";
import { TinkoffOrdersService } from "./Services/OrdersService";
import { TinkoffBetterSignalReceiver } from "./SignalReceiver";
import { StockMarketRobot } from "./StockMarketRobot";
import { BollingerBandsStrategy } from "./Strategy";
import { TinkoffApiClient } from "./TinkoffApiClient";
import { FOUR_HOURS_IN_MS, HOUR_IN_MS, SEC_IN_MS, WEEK_IN_MS } from "./Utils";
import { open, writeFile } from "node:fs/promises";
import { Metadata } from "@grpc/grpc-js";

async function main() {
  if (typeof process.env.TINKOFF_API_TOKEN === "string") {
    const startIsoDate = new Date().toISOString();
    await Logger.setFilePath(`logs-${startIsoDate}.txt`);

    const client = new TinkoffApiClient({
      token: process.env.TINKOFF_API_TOKEN,
      metadata: {
        "x-app-name": "borjomeeee.tinkoff-robot-contest-js",
      },
    });

    const instrumentsService = new TinkoffInstrumentsService(client);
    const marketService = new TinkoffMarketService(client);
    const ordersService = new TinkoffOrdersService({
      client,
      isSandbox: Globals.isSandbox,
    });

    const marketRobot = new StockMarketRobot({
      strategy: new BollingerBandsStrategy({ periods: 20, deviation: 2 }),

      // TODO: move to strategy
      numberCandlesToApplyStrategy: 20,
      minimalCandleTime: Date.now() - WEEK_IN_MS,

      services: {
        instrumentsService,
        marketService,
      },
    });

    const tinkoffBetter = new TinkoffBetterSignalReceiver({
      accountId: Globals.sandboxAccountId,

      takeProfitPercent: 0.2,
      stopLossPercent: 0.2,
      updateOrderStateInterval: SEC_IN_MS,
      expirationTime: FOUR_HOURS_IN_MS,

      lotsPerBet: 1,

      services: {
        ordersService,
        marketService,
        instrumentsService,
      },
    });
    tinkoffBetter.start();

    await marketRobot.run({
      instrumentFigi: Globals.APPL_SPBX_FIGI,
      candleInterval: CandleInterval.CANDLE_INTERVAL_1_MIN,
      terminateAt: Date.now() + HOUR_IN_MS,

      onStrategySignal: tinkoffBetter.receive.bind(tinkoffBetter),
    });

    await tinkoffBetter.forceStop();
    const signalRealizations = tinkoffBetter.getSignalRealizations();

    // Save better report
    const file = await open(`report-${startIsoDate}.json`, "w");
    writeFile(file, JSON.stringify(signalRealizations));
    file.close();
  }
}

async function backtest() {
  if (typeof process.env.TINKOFF_API_TOKEN === "string") {
    const client = new TinkoffApiClient({
      token: process.env.TINKOFF_API_TOKEN,
      metadata: {
        "x-app-name": "borjomeeee.tinkoff-robot-contest-js",
      },
    });

    const marketService = new TinkoffMarketService(client);
    // marketService.subscribeLastPrice(console.log, {
    //   figi: Globals.SBER_MOBX_FIGI,
    // });

    // const tempMarketService = new TinkoffMarketService(client);
    // const candles: any[] = require("./test.json");
    // const historicalCandles = candles.map((candle) =>
    //   tempMarketService._parseHistoricalCandle(candle)
    // );

    // const backtestMarketService = new BacktestMarketService({
    //   candleHistory: historicalCandles,
    // });

    marketService.getLastCandles({
      instrumentFigi: Globals.APPL_SPBX_FIGI,
      interval: CandleInterval.CANDLE_INTERVAL_1_MIN,

      amount: 20,
      from: new Date(Date.now() - WEEK_IN_MS),
    });

    // // client.instruments.shareBy(
    //   {
    //     idType: "INSTRUMENT_ID_TYPE_FIGI" as "INSTRUMENT_ID_TYPE_FIGI",
    //     id: Globals.SBER_MOBX_FIGI,
    //     classCode: "",
    //   },
    //   (e, v) => console.log(e, v)
    // );
  }
}
// main();
backtest();
