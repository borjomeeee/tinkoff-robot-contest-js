import {
  Account,
  AccountMarginInfo,
  SandboxAccountPortfolio,
} from "../Types/Common";

export interface IAccountsService {
  getAccounts: () => Promise<Account[]>;
  getAccountMarginInfo: (accountId: string) => Promise<AccountMarginInfo>;

  getSandboxProtfolios: (accountId: string) => Promise<SandboxAccountPortfolio>;
}
