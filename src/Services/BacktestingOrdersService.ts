import Big from "big.js";
import {
  CompletedOrder,
  OrderExecutionStatus,
  UncompletedOrder,
} from "../Types/Order";
import {
  GetOrderStateOptions,
  IOrdersService,
  PostMarketOrderOptions,
} from "./IOrdersService";

interface IBacktestingOrdersServiceConfig {
  commission: number;
}

export class BacktestingOrdersService implements IOrdersService {
  private config: IBacktestingOrdersServiceConfig;
  private postedOrders: Map<string, CompletedOrder> = new Map();

  constructor(config: IBacktestingOrdersServiceConfig) {
    this.config = config;
  }

  async postMarketOrder(options: PostMarketOrderOptions) {
    const { commission } = this.config;

    const uncompletedOrder: UncompletedOrder = {
      id: options.orderId,
      instrumentFigi: options.instrumentFigi,
      accountId: options.accountId,

      direction: options.orderDirection,
      lots: options.lots,
      status: OrderExecutionStatus.NEW,
    };

    if (!options._price) {
      throw new Error(
        `Get not backtestable market order: ${JSON.stringify(uncompletedOrder)}`
      );
    }

    const totalCommission = new Big(commission * uncompletedOrder.lots);
    const totalPrice = options._price
      .mul(uncompletedOrder.lots)
      .plus(totalCommission);

    const completedOrder: CompletedOrder = {
      ...uncompletedOrder,
      totalPrice,
      totalCommission,

      status: OrderExecutionStatus.COMPLETED,
    };
    this.postedOrders.set(
      this.orderToString(uncompletedOrder.id, uncompletedOrder.accountId),
      completedOrder
    );

    return completedOrder;
  }

  async getOrderState(options: GetOrderStateOptions) {
    const id = this.orderToString(options.orderId, options.accountId);
    if (this.postedOrders.has(id)) {
      return this.postedOrders.get(id) as CompletedOrder;
    } else {
      throw new Error("Order not found!");
    }
  }

  getPostedOrders() {
    return this.postedOrders;
  }

  orderToString(orderId: string, accountId: string) {
    return `Order(orderId=${orderId}, accountId=${accountId})`;
  }
}
