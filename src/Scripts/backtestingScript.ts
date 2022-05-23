import "dotenv/config";
import { Logger, LoggerLevel } from "../Helpers/Logger";
import { TinkoffInstrumentsService } from "../Services/TinkoffInstrumentsService";
import { TinkoffMarketService } from "../Services/TinkoffMarketService";
import { SignalReceivers } from "../SignalReceivers";
import { Strategies } from "../Strategies";
import { TinkoffApiClient } from "../TinkoffApiClient";
import { CandleInterval } from "../Types/Common";
import { BacktestingOrdersService } from "../Services/BacktestingOrdersService";
import { BacktestingMarketDataStream } from "../Services/BacktestingMarketDataStream";
import { Backtester } from "../Backtester";

import dayjs from "dayjs";
import { showOrdersStatistic } from "./utils";
var customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);

async function main() {
  (process.env as any).isBactesting = true;

  await Logger.setFilePath("log-backtest.txt");
  Logger.setLevel(LoggerLevel.DEBUG);

  const config = require("./backtestingConfig.json");
  if (!process.env.TINKOFF_API_TOKEN) {
    throw new Error("TINKOFF_API_TOKEN not found!");
  }

  const client = new TinkoffApiClient({
    token: process.env.TINKOFF_API_TOKEN,
    metadata: {
      "x-app-name": "borjomeeee.tinkoff-robot-contest-js",
    },
  });

  if (
    typeof config.brokerCommission !== "number" ||
    config.brokerCommission < 0
  ) {
    throw new Error("brokerCommission incorrect or empty!");
  }

  const brokerCommission = config.brokerCommission;
  const services = {
    marketService: new TinkoffMarketService(client),
    instrumentsService: new TinkoffInstrumentsService(client),

    marketDataStream: new BacktestingMarketDataStream(),
    ordersService: new BacktestingOrdersService({
      commission: brokerCommission,
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

  if (typeof config.instrumentFigi !== "string") {
    throw new Error("instrumentFigi incorrect or not found!");
  }

  if (
    typeof config.candleInterval !== "string" ||
    !candleIntervalFromStr[config.candleInterval]
  ) {
    throw new Error("candleInterval incorrect or not found!");
  }

  if (
    typeof config.startDate !== "string" ||
    !dayjs(config.startDate, "DD/MM/YYYY").isValid()
  ) {
    throw new Error("startDate is incorrect or empty");
  }

  if (
    typeof config.endDate !== "string" ||
    !dayjs(config.endDate, "DD/MM/YYYY").isValid()
  ) {
    throw new Error("endDate is incorrect or empty");
  }

  const instrumentFigi = config.instrumentFigi;
  const candleInterval = candleIntervalFromStr[config.candleInterval];

  const from = dayjs(config.startDate, "DD/MM/YYYY").toDate().getTime();
  const to = dayjs(config.endDate, "DD/MM/YYYY").toDate().getTime();

  console.log("Config: ", JSON.stringify(config));

  const backtester = await Backtester.of(
    {
      instrumentFigi,
      candleInterval,

      from,
      to,

      commission: brokerCommission,
    },
    services
  );

  console.log("Start backtesting ...");

  await backtester.run({ signalReceiver, strategy });
  await signalReceiver.finishWork();

  const postedOrders = await services.ordersService.getPostedOrders();
  showOrdersStatistic(postedOrders);

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
