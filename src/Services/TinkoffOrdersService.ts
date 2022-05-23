import { CancelOrderRequest } from "@tinkoff/invest-js/build/generated/tinkoff/public/invest/api/contract/v1/CancelOrderRequest";
import { GetOrdersRequest } from "@tinkoff/invest-js/build/generated/tinkoff/public/invest/api/contract/v1/GetOrdersRequest";
import { GetOrderStateRequest } from "@tinkoff/invest-js/build/generated/tinkoff/public/invest/api/contract/v1/GetOrderStateRequest";
import { OrderState__Output } from "@tinkoff/invest-js/build/generated/tinkoff/public/invest/api/contract/v1/OrderState";
import { PostOrderRequest } from "@tinkoff/invest-js/build/generated/tinkoff/public/invest/api/contract/v1/PostOrderRequest";
import { PostOrderResponse__Output } from "@tinkoff/invest-js/build/generated/tinkoff/public/invest/api/contract/v1/PostOrderResponse";

import { OrderDirection } from "../Types/Common";
import { Logger } from "../Helpers/Logger";
import { Order, UncompletedOrder } from "../Types/Order";
import { TimestampUtils } from "../Helpers/Utils";
import { TinkoffApiClient } from "../TinkoffApiClient";
import { OrdersUtils, QuotationUtils } from "../Helpers/Utils";
import {
  CancelOrderOptions,
  GetAccountOrdersOptions,
  GetOrderStateOptions,
  IOrdersService,
  PostLimitOrderOptions,
  PostMarketOrderOptions,
  PostOrderOptions,
} from "./IOrdersService";
import {
  GetAccountOrdersFatalError,
  GetOrderStateFatalError,
  PostOrderFatalError,
} from "../Helpers/Exceptions";

interface ITinkoffOrdersServiceConstructorOptions {
  client: TinkoffApiClient;
  isSandbox: boolean;
}

export class TinkoffOrdersService implements IOrdersService {
  TAG = "TinkoffOrdersService";
  Logger = new Logger();

  private client: TinkoffApiClient;
  private isSandbox: boolean;

  constructor(options: ITinkoffOrdersServiceConstructorOptions) {
    this.client = options.client;
    this.isSandbox = options.isSandbox;
  }

  postMarketOrder(options: PostMarketOrderOptions) {
    return this.postOrder(options, "ORDER_TYPE_MARKET");
  }

  postLimitOrder(options: PostLimitOrderOptions) {
    return this.postOrder(options, "ORDER_TYPE_LIMIT");
  }

  private async postOrder(
    options: PostOrderOptions,
    orderType: "ORDER_TYPE_MARKET" | "ORDER_TYPE_LIMIT"
  ) {
    const request: PostOrderRequest = {
      figi: options.instrumentFigi,
      quantity: options.lots,
      price: options.price ? QuotationUtils.fromBig(options.price) : undefined,
      direction:
        options.orderDirection === OrderDirection.BUY
          ? "ORDER_DIRECTION_BUY"
          : "ORDER_DIRECTION_SELL",
      orderId: options.orderId,
      accountId: options.accountId,
      orderType,
    };

    this.Logger.debug(
      this.TAG,
      `>> Post order with params: ${JSON.stringify(options)}`
    );

    const requestFn = this.isSandbox
      ? this.client.sandbox.postSandboxOrder.bind(this.client.sandbox)
      : this.client.orders.postOrder.bind(this.client.orders);

    return await new Promise<UncompletedOrder>((res, rej) => {
      requestFn(request, (e, v) => {
        try {
          if (e) {
            throw e;
          }

          if (!v) {
            throw new Error("Get undefined order response!");
          }

          const data = this._parseUncompletedOrder(v, options);

          this.Logger.debug(
            this.TAG,
            `<< Post order with params: ${JSON.stringify(
              options
            )}\n${JSON.stringify(data)}`
          );

          res(data);
        } catch (e) {
          rej(new PostOrderFatalError(request, e.message));
        }
      });
    });
  }

  async getOrderState(options: GetOrderStateOptions) {
    const request: GetOrderStateRequest = {
      accountId: options.accountId,
      orderId: options.orderId,
    };

    this.Logger.debug(
      this.TAG,
      `>> Get order state with params: ${JSON.stringify(options)}`
    );

    const requestFn = this.isSandbox
      ? this.client.sandbox.getSandboxOrderState.bind(this.client.sandbox)
      : this.client.orders.getOrderState.bind(this.client.orders);

    return new Promise<Order>((res, rej) => {
      requestFn(request, (e, v) => {
        try {
          if (e) {
            throw e;
          }

          if (!v) {
            throw new Error("Get undefined order state response!");
          }

          const data = this._parseOrder(v, options.accountId);
          this.Logger.debug(
            this.TAG,
            `<< Get order state with params: ${JSON.stringify(
              options
            )}\n${JSON.stringify(data)}`
          );

          res(data);
        } catch (e) {
          rej(new GetOrderStateFatalError(request, e.message));
        }
      });
    });
  }

  // async cancelOrder(options: CancelOrderOptions) {
  //   const requestFn = this.isSandbox
  //     ? this.client.sandbox.cancelSandboxOrder.bind(this.client.sandbox)
  //     : this.client.orders.cancelOrder.bind(this.client.orders);

  //   const request: CancelOrderRequest = {
  //     accountId: options.accountId,
  //     orderId: options.orderId,
  //   };

  //   this.Logger.debug(
  //     this.TAG,
  //     `>> Cancel order with params: ${JSON.stringify(options)}`
  //   );

  //   await new Promise<void>((res, rej) => {
  //     requestFn(request, (e, v) => {
  //       if (!e) {
  //         this.Logger.debug(
  //           this.TAG,
  //           `<< Cancel order with params: ${JSON.stringify(options)}\nSuccess!`
  //         );

  //         res();
  //       } else {
  //         rej(e);
  //       }
  //     });
  //   });
  // }

  async getAccountOrders(options: GetAccountOrdersOptions) {
    const { accountId } = options;
    const self = this;

    const requestFn = this.isSandbox
      ? this.client.sandbox.getSandboxOrders.bind(this.client.sandbox)
      : this.client.orders.getOrders.bind(this.client.orders);

    this.Logger.debug(
      this.TAG,
      `>> Get account orders with params: ${JSON.stringify(options)}`
    );

    const request: GetOrdersRequest = { accountId };
    return await new Promise<Order[]>((res, rej) => {
      requestFn(request, (e, v) => {
        try {
          if (e) {
            throw e;
          }

          const data = (v?.orders || []).map((order) =>
            self._parseOrder(order, accountId)
          );

          this.Logger.debug(
            this.TAG,
            `<< Get account orders with params: ${JSON.stringify(
              options
            )}\n${JSON.stringify(data)}`
          );

          res(data);
        } catch (e) {
          rej(new GetAccountOrdersFatalError(request, e.message));
        }
      });
    });
  }

  _parseUncompletedOrder(
    feature: PostOrderResponse__Output,
    options: PostOrderOptions
  ): UncompletedOrder {
    return {
      id: feature.orderId,
      accountId: options.accountId,

      lots: +feature.lotsRequested,

      instrumentFigi: options.instrumentFigi,
      direction: options.orderDirection,
      status: OrdersUtils.getExecutionStatusFromString(
        feature.executionReportStatus
      ),
    };
  }

  _parseOrder(feature: OrderState__Output, accountId: string): Order {
    return {
      id: feature.orderId,
      accountId: accountId,

      lots: +feature.lotsRequested,
      instrumentFigi: feature.figi,
      direction: OrdersUtils.getDirectionFromString(feature.direction),
      status: OrdersUtils.getExecutionStatusFromString(
        feature.executionReportStatus
      ),

      totalPrice: feature.executedOrderPrice
        ? QuotationUtils.toBig(feature.executedOrderPrice)
        : undefined,
      totalCommission: feature.executedCommission
        ? QuotationUtils.toBig(feature.executedCommission)
        : undefined,

      time: feature.orderDate
        ? TimestampUtils.toDate(feature.orderDate).getTime()
        : undefined,
    };
  }
}
