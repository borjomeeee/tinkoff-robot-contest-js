import Big from "big.js";
import { OrderDirection } from "../Types/Common";
import { Order, UncompletedOrder } from "../Types/Order";

export interface IOrdersService {
  postMarketOrder: (
    options: PostMarketOrderOptions
  ) => Promise<UncompletedOrder>;
  getOrderState: (options: GetOrderStateOptions) => Promise<Order>;

  // Can be extended

  // postLimitOrder: (options: PostLimitOrderOptions) => Promise<UncompletedOrder>;
  // cancelOrder: (options: CancelOrderOptions) => Promise<void>;

  // getAccountOrders: (options: GetAccountOrdersOptions) => Promise<Order[]>;
}

export interface PostOrderOptions {
  instrumentFigi: string;
  orderDirection: OrderDirection;

  price?: Big;
  lots: number;

  orderId: string;
  accountId: string;
}

export interface PostMarketOrderOptions extends PostOrderOptions {
  // Backtesting option
  _price?: Big;
}
export interface PostLimitOrderOptions extends PostOrderOptions {
  price: Big;
}
export interface CancelOrderOptions {
  accountId: string;
  orderId: string;
}

export interface GetOrderStateOptions {
  accountId: string;
  orderId: string;
}

export interface GetAccountOrdersOptions {
  accountId: string;
}
