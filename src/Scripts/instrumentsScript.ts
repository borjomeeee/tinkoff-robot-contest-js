import "dotenv/config";
import { Logger, LoggerLevel } from "../Helpers/Logger";
import { TinkoffApiClient } from "../TinkoffApiClient";

const tickerFlag = "--ticker=";
async function main() {
  Logger.setLevel(LoggerLevel.DISABLED);

  let ticker: string | undefined;
  const args = process.argv.slice(2);
  args.forEach((arg) => {
    if (arg.startsWith(tickerFlag)) {
      ticker = arg.replace(tickerFlag, "");
    }
  });

  if (!ticker) {
    throw new Error("--ticker flag incorrect or empty!");
  }

  if (!process.env.TINKOFF_API_TOKEN) {
    throw new Error("TINKOFF_API_TOKEN not found!");
  }

  const client = new TinkoffApiClient({
    token: process.env.TINKOFF_API_TOKEN,
    metadata: {
      "x-app-name": "borjomeeee.tinkoff-robot-contest-js",
    },
  });

  client.instruments.shares({}, (x, y) => {
    if (x) {
      console.log("Catch error: ", x.message);
      return;
    }

    const instruments = (y?.instruments || []).filter(
      (x) => x.ticker === ticker
    );
    if (instruments.length > 0) {
      console.log(instruments.map((i) => ({ figi: i.figi, name: i.name })));
    } else {
      console.log(`Instrument with ticker '${ticker}' not found!`);
    }
  });
}

main();
