import { Logger } from "../Helpers/Logger";
import { AccountUtils, QuotationUtils } from "../Helpers/Utils";
import { TinkoffApiClient } from "../TinkoffApiClient";
import {
  Account,
  AccountMarginInfo,
  SandboxAccountPortfolio,
} from "../Types/Common";
import { IAccountsService } from "./IAccountsService";

interface ITinkoffAccountsServiceOptions {
  client: TinkoffApiClient;
  isSandbox?: boolean;
}
export class TinkoffAccountsService implements IAccountsService {
  TAG = "TinkoffAccountService";
  Logger = new Logger();

  private client: TinkoffApiClient;
  private isSandbox: boolean | undefined;

  constructor(options: ITinkoffAccountsServiceOptions) {
    this.client = options.client;
    this.isSandbox = options.isSandbox;
  }

  getAccounts() {
    this.Logger.debug(this.TAG, `>> Get user accounts`);

    const requestFn = this.isSandbox
      ? this.client.sandbox.getSandboxAccounts.bind(this.client.sandbox)
      : this.client.usersService.getAccounts.bind(this.client.usersService);

    return new Promise<Account[]>((res, rej) => {
      requestFn({}, (e, v) => {
        try {
          if (e) {
            throw e;
          }

          const data = (v?.accounts || []).map(this._parseAccount);
          this.Logger.debug(
            this.TAG,
            `<< Get user accounts \n${JSON.stringify(data)}`
          );
          res(data);
        } catch (e) {
          rej(e);
        }
      });
    });
  }

  getAccountMarginInfo(accountId: string) {
    this.Logger.debug(
      this.TAG,
      `>> Get account marging info for accountId: ${accountId}`
    );

    return new Promise<AccountMarginInfo>((res, rej) => {
      if (this.isSandbox) {
        rej(new Error("No margin attributes for account in sandbox!"));
        return;
      }

      this.client.usersService.getMarginAttributes({ accountId }, (e, v) => {
        try {
          if (e) {
            throw e;
          }

          const data = this._parseMarginAttributes(v);
          this.Logger.debug(
            this.TAG,
            `<< Get account marging info for accountId: ${accountId}\n${JSON.stringify(
              data
            )}`
          );
          res(data);
        } catch (e) {
          rej(e);
        }
      });
    });
  }

  getSandboxProtfolios(accountId: string) {
    this.Logger.debug(
      this.TAG,
      `>> Get sandbox account info for accountId: ${accountId}`
    );

    return new Promise<SandboxAccountPortfolio>((res, rej) => {
      if (!this.isSandbox) {
        rej(new Error("No portfolio for account in not sandbox!"));
        return;
      }

      this.client.sandbox.getSandboxPortfolio({ accountId }, (e, v) => {
        try {
          if (e) {
            throw e;
          }

          const data = this._parseSandboxAccountPortfolio(v);
          this.Logger.debug(
            this.TAG,
            `<< Get sandbox account info for accountId: ${accountId}\n${JSON.stringify(
              data
            )}`
          );

          res(data);
        } catch (e) {
          rej(e);
        }
      });
    });
  }

  _parseAccount(feature: any): Account {
    return {
      id: feature.id,
      name: feature.name,
      status: AccountUtils.getStatusFromString(feature.status),
    };
  }

  _parseMarginAttributes(feature: any): AccountMarginInfo {
    return {
      portfolio: QuotationUtils.toBig(feature.liquidPortfolio),
      startMarging: QuotationUtils.toBig(feature.startingMargin),
      minMarging: QuotationUtils.toBig(feature.minimal_margin),
      sufficiencyLevel: QuotationUtils.toBig(feature.fundsSufficiencyLevel),
      missingFunds: QuotationUtils.toBig(feature.amountOfMissingFunds),
    };
  }

  _parseSandboxAccountPortfolio(feature: any): SandboxAccountPortfolio {
    return {
      totalShares: QuotationUtils.toBig(feature.totalAmountShares),
      totalBonds: QuotationUtils.toBig(feature.totalAmountBonds),
      totalEtf: QuotationUtils.toBig(feature.totalAmountEtf),
      totalCurrencies: QuotationUtils.toBig(feature.totalAmountCurrencies),
      totalFutures: QuotationUtils.toBig(feature.totalAmountFutures),
    };
  }
}
