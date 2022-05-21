import "dotenv/config";

import Big from "big.js";
import { CandleInterval, OrderDirection } from "./Types/Common";
import { Globals } from "./Globals";
import { Logger, LoggerLevel } from "./Helpers/Logger";

import { StockMarketRobot } from "./StockMarketRobot";
import { TinkoffApiClient } from "./TinkoffApiClient";
import { DAY_IN_MS, HOUR_IN_MS, SEC_IN_MS, WEEK_IN_MS } from "./Helpers/Utils";
import { open, writeFile } from "node:fs/promises";
import { Backtester } from "./Backtester";
import { BacktestingOrdersService } from "./Services/BacktestingOrdersService";
import { BacktestingMarketDataStream } from "./Services/BacktestingMarketDataStream";
import { TinkoffInstrumentsService } from "./Services/TinkoffInstrumentsService";
import { TinkoffMarketService } from "./Services/TinkoffMarketService";
import { TinkoffMarketDataStream } from "./Services/TinkoffMarketDataStream";
import { TinkoffOrdersService } from "./Services/TinkoffOrdersService";
import { BollingerBandsStrategy } from "./Strategies/BollingerBands";
import { SampleSignalResolver } from "./SignalReceivers/SampleSignalResolver";


// TODO:
// - add comments
// - set starting via config

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
    const marketDataStream = new TinkoffMarketDataStream(client);
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

    const signalResolver = new SampleSignalResolver({
      accountId: Globals.sandboxAccountId,

      lotsPerBet: 1,
      maxConcurrentBets: 1,
      commission: 0.0003,

      takeProfitPercent: 0.2,
      stopLossPercent: 0.2,
      updateOrderStateInterval: SEC_IN_MS,

      services: {
        ordersService,
        marketDataStream,
        instrumentsService,
      },
    });
    signalResolver.start();

    await marketRobot.run({
      instrumentFigi: Globals.APPL_SPBX_FIGI,
      candleInterval: CandleInterval.CANDLE_INTERVAL_1_MIN,
      terminateAt: Date.now() + HOUR_IN_MS,

      onStrategySignal: signalResolver.receive.bind(signalResolver),
    });

    await signalResolver.forceStop();
    const signalRealizations = signalResolver.getSignalRealizations();

    // Save better report
    const file = await open(`report-${startIsoDate}.json`, "w");
    writeFile(file, JSON.stringify(signalRealizations));
    file.close();
  }
}

async function backtest() {
  if (typeof process.env.TINKOFF_API_TOKEN === "string") {
    Logger.setLevel(LoggerLevel.DISABLED);

    const client = new TinkoffApiClient({
      token: process.env.TINKOFF_API_TOKEN,
      metadata: {
        "x-app-name": "borjomeeee.tinkoff-robot-contest-js",
      },
    });

    const instrumentsService = new TinkoffInstrumentsService(client);
    const marketService = new TinkoffMarketService(client);

    const marketDataStream = new BacktestingMarketDataStream();
    const ordersService = new BacktestingOrdersService({ commission: 0.0003 });

    // Preload instrument
    await instrumentsService.getInstrumentByFigi({
      figi: Globals.APPL_SPBX_FIGI,
    });

    const signalResolver = new SampleSignalResolver({
      accountId: Globals.sandboxAccountId,

      lotsPerBet: 1,
      maxConcurrentBets: 1,
      commission: 0.0003,

      takeProfitPercent: 0.1,
      stopLossPercent: 0.1,

      updateOrderStateInterval: SEC_IN_MS,

      services: {
        ordersService,
        instrumentsService,
        marketDataStream,
      },
    });
    signalResolver.start();

    const backtester = await Backtester.of({
      instrumentFigi: Globals.APPL_SPBX_FIGI,
      from: new Date(Date.now() - 2 * DAY_IN_MS),
      amount: 1_000,
      candleInterval: CandleInterval.CANDLE_INTERVAL_15_MIN,

      services: {
        marketService,
        marketDataStream,
      },

      commission: 0.0003,
    });

    await backtester.run({
      strategy: new BollingerBandsStrategy({ periods: 20, deviation: 2 }),
      signalReceiver: signalResolver,
    });

    await signalResolver.forceStop();

    const postedOrders = ordersService.getPostedOrders();
    console.log("Total posted orders: ", postedOrders.size);

    let profit = new Big(0);
    let sumBetPrices = new Big(0);

    postedOrders.forEach((order) => {
      if (order.direction === OrderDirection.BUY) {
        profit = profit.minus(order.totalPrice.plus(order.totalCommission));
      } else {
        profit = profit.plus(order.totalPrice.minus(order.totalCommission));
      }

      sumBetPrices = sumBetPrices.plus(order.totalPrice);
    });
    const avgBetSize = sumBetPrices.div(postedOrders.size);

    console.log(
      `Total profit: ${profit.toString()}, (in percent: ${profit
        .div(avgBetSize)
        .mul(100)})`
    );
  }
}
// main();
backtest();
