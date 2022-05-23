import "dotenv/config";
import Big from "big.js";

import { Logger, LoggerLevel } from "../Helpers/Logger";
import { QuotationUtils } from "../Helpers/Utils";
import { TinkoffApiClient } from "../TinkoffApiClient";

const accountIdFlag = "--accountId=";
const amountFlag = "--amount=";

async function main() {
  Logger.setLevel(LoggerLevel.DISABLED);
  if (!process.env.TINKOFF_API_TOKEN) {
    throw new Error("TINKOFF_API_TOKEN not found!");
  }

  let amount = 100_000;
  let accountId: string | undefined;

  const args = process.argv.slice(2);
  args.forEach((arg) => {
    if (arg.startsWith(accountIdFlag)) {
      accountId = arg.replace(accountIdFlag, "").trim();
    }

    if (arg.startsWith(amountFlag)) {
      const num = parseFloat(arg.replace(amountFlag, "").trim());
      if (!Number.isNaN(num)) {
        amount = num;
      }
    }
  });

  if (!accountId) {
    throw new Error("accountId incorrect or empty!");
  }

  const client = new TinkoffApiClient({
    token: process.env.TINKOFF_API_TOKEN,
    metadata: {
      "x-app-name": "borjomeeee.tinkoff-robot-contest-js",
    },
  });

  if (accountId) {
    client.sandbox.sandboxPayIn(
      { accountId, amount: QuotationUtils.fromBig(Big(amount)) },
      (e) => {
        if (e) {
          console.log("Catch error: ", e.message);
        } else {
          console.log(`Success pay in account id: ${accountId}`);
          console.log(`Amount: ${amount}`);
        }
      }
    );
  }
}

main();
