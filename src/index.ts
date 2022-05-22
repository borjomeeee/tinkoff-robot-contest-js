import "dotenv/config";

import Big from "big.js";
import { CandleInterval, OrderDirection } from "./Types/Common";
import { Globals } from "./Globals";
import { Logger, LoggerLevel } from "./Helpers/Logger";

import { StockMarketRobot } from "./StockMarketRobot";
import { TinkoffApiClient } from "./TinkoffApiClient";
import { DAY_IN_MS, HOUR_IN_MS, SEC_IN_MS } from "./Helpers/Utils";
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
import { IServices } from "./Services/IServices";

import dayjs from "dayjs";
var customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);

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
        commission: 0.0003,

        takeProfitPercent: 0.2,
        stopLossPercent: 0.2,

        forceCloseOnFinish: false,
      },
      services
    );

    const marketRobot = new StockMarketRobot(
      {
        signalReceiver: signalResolver,
      },
      services
    );

    await marketRobot.run({
      strategy: new BollingerBandsStrategy({ periods: 20, deviation: 2 }),

      instrumentFigi: Globals.APPL_SPBX_FIGI,
      candleInterval: CandleInterval.CANDLE_INTERVAL_1_MIN,

      terminateAt: Date.now() + HOUR_IN_MS,
    });

    await signalResolver.finishWork();
    const signalRealizations = signalResolver.getSignalRealizations();

    // Save better report
    const file = await open(`report-${startIsoDate}.json`, "w");
    writeFile(file, JSON.stringify(signalRealizations));
    file.close();
  }
}

async function backtest() {
  if (typeof process.env.TINKOFF_API_TOKEN === "string") {
    Logger.setLevel(LoggerLevel.DEBUG);

    const client = new TinkoffApiClient({
      token: process.env.TINKOFF_API_TOKEN,
      metadata: {
        "x-app-name": "borjomeeee.tinkoff-robot-contest-js",
      },
    });

    const services = {
      instrumentsService: new TinkoffInstrumentsService(client),
      marketDataStream: new BacktestingMarketDataStream(),
      marketService: new TinkoffMarketService(client),
      ordersService: new BacktestingOrdersService({ commission: 0.0003 }),
    };

    const signalResolver = new SampleSignalResolver(
      {
        accountId: Globals.sandboxAccountId,

        lotsPerBet: 1,
        maxConcurrentBets: 1,
        commission: 0.0003,

        takeProfitPercent: 0.1,
        stopLossPercent: 0.1,
      },
      services
    );

    const backtester = await Backtester.of(
      {
        instrumentFigi: Globals.APPL_SPBX_FIGI,
        candleInterval: CandleInterval.CANDLE_INTERVAL_15_MIN,

        from: dayjs("28/04/2022", "DD/MM/YYYY").toDate().getTime(),
        to: dayjs("30/04/2022", "DD/MM/YYYY").toDate().getTime(),

        commission: 0.0003,
      },
      services
    );

    try {
      await backtester.run({
        strategy: new BollingerBandsStrategy({ periods: 20, deviation: 2 }),
        signalReceiver: signalResolver,
      });
    } catch (ignored) {}
    await signalResolver.finishWork();

    const postedOrders = services.ordersService.getPostedOrders();
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

    if (postedOrders.size > 0) {
      const avgBetSize = sumBetPrices.div(postedOrders.size);

      console.log(
        `Total profit: ${profit.toString()}, (in percent: ${profit
          .div(avgBetSize)
          .mul(100)})`
      );
    }
  }
}

// main();
backtest();
// fromConfig();
