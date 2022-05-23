import "dotenv/config";
import { Logger, LoggerLevel } from "../Helpers/Logger";
import { AccountUtils } from "../Helpers/Utils";
import { TinkoffAccountsService } from "../Services/TinkoffAccountsService";
import { TinkoffApiClient } from "../TinkoffApiClient";

const sandboxFlag = "--sandbox";
async function main() {
  let isSandbox = false;

  const args = process.argv.slice(2);
  args.forEach((arg) => {
    if (arg === sandboxFlag) {
      isSandbox = true;
    }
  });

  Logger.setLevel(LoggerLevel.DISABLED);
  if (!process.env.TINKOFF_API_TOKEN) {
    throw new Error("TINKOFF_API_TOKEN not found!");
  }

  const client = new TinkoffApiClient({
    token: process.env.TINKOFF_API_TOKEN,
    metadata: {
      "x-app-name": "borjomeeee.tinkoff-robot-contest-js",
    },
  });

  const accountsService = new TinkoffAccountsService({
    client,
    isSandbox,
  });

  try {
    const accounts = await accountsService.getAccounts();

    console.log("Accounts: ");
    console.log(
      accounts.map((account) => ({
        ...account,
        status: AccountUtils.getDescrFromStatus(account.status),
      }))
    );

    if (isSandbox) {
      const portfolios = await Promise.allSettled(
        accounts.map((account) =>
          accountsService.getSandboxProtfolios(account.id).then((info) => {
            return {
              accountId: account.id,
              portflio: info,
            };
          })
        )
      );

      console.log("Portfolios info: ");
      console.log(
        JSON.stringify(
          portfolios.filter((res) => res.status === "fulfilled"),
          null,
          2
        )
      );
    } else {
      const marginInfos = await Promise.allSettled(
        accounts.map((account) =>
          accountsService.getAccountMarginInfo(account.id).then((info) => ({
            accountId: account.id,
            marginInfo: info,
          }))
        )
      );

      console.log("Margin info: ");
      console.log(
        JSON.stringify(
          marginInfos.filter((res) => res.status === "fulfilled"),
          null,
          2
        )
      );
    }
  } catch (e) {
    console.log("Cath error: ", e.message);
  }

  process.exit(0);
}

main();
