import {
  IStockMarketRobotStrategySignal,
  IStockMarketRobotStrategySignalReceiver,
} from "./Bot";

import { Logger } from "./Logger";

import {
  IInstrumentsService,
  IMarketService,
  IOrdersService,
  LastPriceSubscription,
  PostMarketOrderOptions,
} from "./Services/Types";
import {
  CompletedOrder,
  OrderExecutionStatus,
  UncompletedOrder,
} from "./Order";
import { OrderDirection } from "./CommonTypes";
import { sleep, Terminatable } from "./Utils";
import { TinkoffBetterSignalRealization } from "./Signal";

interface TinkoffBetterSignalOrdersPair {
  signal: IStockMarketRobotStrategySignal;

  openOrderId: string;
  closeOrderId?: string;
}

interface ITinkoffBetterSignalReceiverConfig {
  accountId: string;
  lotsPerBet: number;

  takeProfitPercent: number;
  stopLossPercent: number;
  updateOrderStateInterval: number;
  expirationTime: number;

  services: {
    ordersService: IOrdersService;
    marketService: IMarketService;
    instrumentsService: IInstrumentsService;
  };
}

export class TinkoffBetterSignalReceiver
  implements IStockMarketRobotStrategySignalReceiver
{
  TAG = "TinkoffBetterSignalReceiver";
  Logger = new Logger();

  private orderRequests: Record<string, true> = {};
  private postedOrders: string[] = [];
  private signalRealizations: Record<string, TinkoffBetterSignalRealization> =
    {};

  private terminatable = new Terminatable();

  private config: ITinkoffBetterSignalReceiverConfig;
  constructor(config: ITinkoffBetterSignalReceiverConfig) {
    this.config = config;
  }

  private processingOrders = 0;
  private finishWaiters: (() => any)[] = [];

  private startProcessingOrder() {
    this.processingOrders++;
  }
  private stopProcessingOrder() {
    this.processingOrders--;
    if (this.processingOrders === 0) {
      this.finishWaiters.forEach((waiter) => waiter());
      this.finishWaiters = [];
    }
  }

  getSignalRealizations() {
    return this.signalRealizations;
  }

  waitForFinishOrders() {
    if (this.processingOrders === 0) {
      return;
    }

    return new Promise<void>((res) => {
      this.finishWaiters.push(res);
    });
  }

  async receive(signal: IStockMarketRobotStrategySignal) {
    const { lotsPerBet, accountId } = this.config;
    const { robotId } = signal;
    this.Logger.debug(this.TAG, `Receive signal: ${JSON.stringify(signal)}`);

    const signalId = robotId + "@" + signal.lastCandle.time.toString();
    const orderId = signalId;

    if (this.signalRealizations[signalId]) {
      this.Logger.warn(this.TAG, "Reject duplication signal!");
      return;
    }

    this.signalRealizations[signalId] = new TinkoffBetterSignalRealization(
      signal
    );

    let signalOrderCompleted: CompletedOrder | undefined;
    try {
      this.startProcessingOrder();
      const signalOrder = await this.postOrder({
        instrumentFigi: signal.instrumentFigi,
        orderDirection: signal.orderDirection,
        lots: lotsPerBet,
        accountId,
        orderId,
      });

      this.signalRealizations[signalId].setOpenOrderId(signalOrder.id);

      this.Logger.debug(
        this.TAG,
        `Waiting for order to completed: ${JSON.stringify(signalOrder)}`
      );
      signalOrderCompleted = await this.waitForCompleteOrder(signalOrder);
      this.Logger.debug(
        this.TAG,
        `Waiting for order to completed successful: ${JSON.stringify(
          signalOrder
        )}`
      );
    } catch (e) {
      this.signalRealizations[signalId].handleOpenOrderError(e.message);
      return;
    } finally {
      this.stopProcessingOrder();
    }

    await this.waitForStopLossOrTakeProfit(signalOrderCompleted);

    try {
      this.startProcessingOrder();

      const closingOrderId = robotId + "@" + Date.now().toString();
      const closingOrder = await this.postOrder({
        instrumentFigi: signal.instrumentFigi,
        orderDirection:
          signal.orderDirection === OrderDirection.BUY
            ? OrderDirection.SELL
            : OrderDirection.BUY,
        lots: lotsPerBet,
        accountId,
        orderId: closingOrderId,
      });

      this.signalRealizations[signalId].setCloseOrderId(closingOrder.id);

      this.Logger.debug(
        this.TAG,
        `Waiting for order to completed: ${JSON.stringify(closingOrder)}`
      );

      this.postedOrders.push(closingOrder.id);
      await this.waitForCompleteOrder(closingOrder);
      this.Logger.debug(
        this.TAG,
        `Waiting for order to completed successful: ${JSON.stringify(
          closingOrder
        )}`
      );
    } catch (e) {
      this.signalRealizations[signalId].handleCloseOrderError(e.message);
      await this.closeOpenOrder(signalId);
      return;
    } finally {
      this.stopProcessingOrder();
    }
  }

  private async waitForStopLossOrTakeProfit(order: CompletedOrder) {
    const { services, takeProfitPercent, stopLossPercent } = this.config;
    const { marketService, instrumentsService } = services;

    const instrument = await instrumentsService.getInstrumentByFigi({
      figi: order.instrumentFigi,
    });

    const instrumentPrice = order.totalPrice
      .div(order.lots)
      .div(instrument.lot);

    const takeProfit = instrumentPrice.mul(1 + takeProfitPercent / 100);
    const stopLoss = instrumentPrice.mul(1 - stopLossPercent / 100);

    let instrumentLastPriceSub: LastPriceSubscription | undefined;

    try {
      return await new Promise<void>((res) => {
        instrumentLastPriceSub = marketService.subscribeLastPrice(
          async (price) => {
            if (takeProfit.lte(price) || stopLoss.gte(price)) {
              this.Logger.debug(
                this.TAG,
                `Fix signal open order: ${JSON.stringify(order)}`
              );

              res();
            }
          },
          {
            figi: order.instrumentFigi,
          }
        );
      });
    } finally {
      instrumentLastPriceSub &&
        marketService.unsubscribeLastPrice(instrumentLastPriceSub);
    }
  }

  private async waitForCompleteOrder(
    order: UncompletedOrder
  ): Promise<CompletedOrder> {
    const { services, accountId, updateOrderStateInterval } = this.config;
    const { ordersService } = services;

    while (true) {
      const currentOrderState = await ordersService.getOrderState({
        accountId,
        orderId: order.id,
      });

      if (currentOrderState.status === OrderExecutionStatus.COMPLETED) {
        if (
          !currentOrderState.totalPrice ||
          !currentOrderState.totalCommision
        ) {
          throw new Error(
            `Total price or total commission is empty, order id: ${currentOrderState.id}`
          );
        }

        return currentOrderState as CompletedOrder;
      }

      if (
        currentOrderState.status === OrderExecutionStatus.NEW ||
        currentOrderState.status === OrderExecutionStatus.PARTIALLY_COMPLETED
      ) {
        await sleep(updateOrderStateInterval);
        continue;
      }

      throw new Error(
        `Order was completed with not expected status: ${currentOrderState.status}`
      );
    }
  }

  private async postOrder(
    options: PostMarketOrderOptions
  ): Promise<UncompletedOrder> {
    const { services } = this.config;
    const { ordersService } = services;

    try {
      this.orderRequests[options.orderId] = true;
      return await ordersService.postMarketOrder(options);
    } finally {
      delete this.orderRequests[options.orderId];
    }
  }

  private async closeOpenOrder(signalId: string) {
    const { services, accountId } = this.config;
    const { ordersService } = services;

    const signalRealization = this.signalRealizations[signalId];
    if (signalRealization && signalRealization.openOrderId) {
      try {
        this.startProcessingOrder();
        return await ordersService.cancelOrder({
          orderId: signalRealization.openOrderId,
          accountId,
        });
      } catch (e) {
        signalRealization.handleCancelOpenOrderError(e.message);
      } finally {
        this.stopProcessingOrder();
      }
    }
  }
}
