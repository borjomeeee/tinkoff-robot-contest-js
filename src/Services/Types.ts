import Big from "big.js";
import {
  Candle,
  CandleInterval,
  Instrument,
  OrderDirection,
  SubscriptionCandleInverval,
  TradingSchedule,
} from "../CommonTypes";
import { Order, OrderTrade, UncompletedOrder } from "../Order";

export interface IMarketService {
  subscribeCandles(
    options: CandleSubscriptionOptions,
    fn: CandleSupscription
  ): CandleSupscription;

  unsubscribeCandles(fn: CandleSupscription): void;

  subscribeLastPrice(
    options: LastPriceSubscriptionOptions,
    fn: LastPriceSubscription
  ): LastPriceSubscription;

  unsubscribeLastPrice(fn: LastPriceSubscription): void;

  getCandles(options: GetCandlesOptions): Promise<Candle[]>;
  getLastCandles(options: GetLastCandlesOptions): Promise<Candle[]>;
}

export interface IInstrumentsService {
  getInstrumentByFigi(options: GetInstrumentByFigiOptions): Promise<Instrument>;
  getInstrumentTradingSchedule(
    options: GetInstrumentTradingScheduleOptions
  ): Promise<TradingSchedule>;
}

export interface IOrdersService {
  postMarketOrder: (
    options: PostMarketOrderOptions
  ) => Promise<UncompletedOrder>;
  postLimitOrder: (options: PostLimitOrderOptions) => Promise<UncompletedOrder>;

  cancelOrder: (options: CancelOrderOptions) => Promise<void>;

  getOrderState: (options: GetOrderStateOptions) => Promise<Order>;
  getAccountOrders: (options: GetAccountOrdersOptions) => Promise<Order[]>;

  // subscribeOrderTrades: (
  //   fn: OrderTradesSubscription,
  //   options: OrderTradesSubscriptionOptions
  // ) => OrderTradesSubscription;

  // unsubscribeOrderTrades: (fn: OrderTradesSubscription) => void;
}

export type CandleSupscription = (candle: Candle) => any;
export type LastPriceSubscription = (price: Big) => any;

export type OrderTradesSubscription = (trade: OrderTrade) => any;
export interface CandleSubscriptionOptions {
  figi: string;
  interval: SubscriptionCandleInverval;
}

export interface LastPriceSubscriptionOptions {
  figi: string;
}

export interface OrderTradesSubscriptionOptions {
  accountId: string;
}

export interface GetCandlesOptions {
  instrumentFigi: string;
  interval: CandleInterval;

  from: Date;
  to: Date;
}

export interface GetLastCandlesOptions {
  instrumentFigi: string;
  interval: CandleInterval;

  amount: number;
  from: Date;
}

export interface GetInstrumentByFigiOptions {
  figi: string;
}

export interface GetInstrumentTradingScheduleOptions {
  exchange: string;

  from: Date;
  to: Date;
}

export interface PostOrderOptions {
  instrumentFigi: string;
  orderDirection: OrderDirection;

  price?: Big;
  lots: number;

  orderId: string;
  accountId: string;
}

export interface PostMarketOrderOptions extends PostOrderOptions {}
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
