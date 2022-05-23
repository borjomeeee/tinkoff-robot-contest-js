import "dotenv/config";
import { Logger, LoggerLevel } from "../Helpers/Logger";
import { IServices } from "../Services/IServices";
import { TinkoffInstrumentsService } from "../Services/TinkoffInstrumentsService";
import { TinkoffMarketDataStream } from "../Services/TinkoffMarketDataStream";
import { TinkoffMarketService } from "../Services/TinkoffMarketService";
import { TinkoffOrdersService } from "../Services/TinkoffOrdersService";
import { SignalReceivers } from "../SignalReceivers";
import { StockMarketRobot } from "../StockMarketRobot";
import { Strategies } from "../Strategies";
import { TinkoffApiClient } from "../TinkoffApiClient";
import { CandleInterval } from "../Types/Common";
import { open, writeFile } from "node:fs/promises";

import dayjs from "dayjs";
var customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);

async function main() {
  const startDateIso = new Date().toISOString();

  await Logger.setFilePath(`./log-${startDateIso}.txt`);
  Logger.setLevel(LoggerLevel.DEBUG);

  let reportPath = `./report-${startDateIso}.json`;

  const config = require("./runningConfig.json");
  if (!process.env.TINKOFF_API_TOKEN) {
    throw new Error("TINKOFF_API_TOKEN not found!");
  }

  const client = new TinkoffApiClient({
    token: process.env.TINKOFF_API_TOKEN,
    metadata: {
      "x-app-name": "borjomeeee.tinkoff-robot-contest-js",
    },
  });

  const services: IServices = {
    marketService: new TinkoffMarketService(client),
    marketDataStream: new TinkoffMarketDataStream(client),
    instrumentsService: new TinkoffInstrumentsService(client),

    ordersService: new TinkoffOrdersService({
      client,
      isSandbox: config.isSandbox || false,
    }),
  };

  if (!config.strategy) {
    throw new Error("strategy not found!");
  }

  const strategyName = Object.keys(config.strategy)[0];
  const StrategyConstructor = Strategies[strategyName];

  if (!StrategyConstructor) {
    throw new Error(`Not found strategy with name: ${strategyName}`);
  }

  const strategy = new StrategyConstructor(
    config.strategy[strategyName],
    services
  );

  if (!config.signalReceiver) {
    throw new Error("signalReceiver not found!");
  }

  const signalReceiverName = Object.keys(config.signalReceiver)[0];
  const SignalReceiver = SignalReceivers[signalReceiverName];

  if (!SignalReceiver) {
    throw new Error(
      `Not found signal receiver with name: ${signalReceiverName}`
    );
  }

  const signalReceiver = new SignalReceiver(
    config.signalReceiver[signalReceiverName],
    services
  );

  const stockMarketRobot = new StockMarketRobot({ signalReceiver }, services);

  if (typeof config.instrumentFigi !== "string") {
    throw new Error("instrumentFigi incorrect or not found!");
  }

  if (
    typeof config.candleInterval !== "string" ||
    !candleIntervalFromStr[config.candleInterval]
  ) {
    throw new Error("candleInterval incorrect or not found!");
  }

  const instrumentFigi = config.instrumentFigi;
  const candleInterval = candleIntervalFromStr[config.candleInterval];

  console.log("Start config: ", JSON.stringify(config));

  // Wait for complete job or press stop
  await new Promise<void>(async (resolve) => {
    console.log(`Please type 'stop' to terminate bot ...`);

    process.stdin.on("data", (buffer) => {
      if (buffer.toString().trim() === "stop") {
        stockMarketRobot.stop();
        resolve();
      } else {
        console.log(`Please type 'stop' to terminate bot ...`);
      }
    });

    try {
      await stockMarketRobot.run({
        strategy,

        instrumentFigi,
        candleInterval,
      });
    } catch (ignored) {}

    resolve();
  });

  const robotReport = stockMarketRobot.makeReport();
  const signalReceiverReport = await signalReceiver.finishWork();

  const report = {
    start: startDateIso,
    end: new Date().toISOString(),

    robotReport,
    signalReceiverReport,
  };

  const file = await open(reportPath, "w");
  writeFile(file, JSON.stringify(report));
  file.close();

  process.exit(0);
}

const candleIntervalFromStr: Record<string, CandleInterval> = {
  "1m": CandleInterval.CANDLE_INTERVAL_1_MIN,
  "5m": CandleInterval.CANDLE_INTERVAL_5_MIN,
  "15m": CandleInterval.CANDLE_INTERVAL_15_MIN,
  "1h": CandleInterval.CANDLE_INTERVAL_HOUR,
  "1d": CandleInterval.CANDLE_INTERVAL_DAY,
};

main();
