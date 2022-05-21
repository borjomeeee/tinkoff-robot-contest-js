import {
  IStockMarketRobotStrategySignal,
  IStockMarketRobotStrategySignalReceiver,
} from "./Bot";

import { Logger } from "./Logger";

import {
  IInstrumentsService,
  IMarketService,
  IOrdersService,
} from "./Services/Types";
import {
  CompletedOrder,
  OrderExecutionStatus,
  UncompletedOrder,
} from "./Order";
import { OrderDirection } from "./CommonTypes";
import { noop, sleep, Terminatable } from "./Utils";
import { SignalRealization, SignalRealizationErrorReason } from "./Signal";

import { v5 as uuidv5, v4 as uuidv4 } from "uuid";
import { Globals } from "./Globals";
import { StrategyPredictAction } from "./Strategy";

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

// TinkoffSignalResolverSample
export class TinkoffBetterSignalReceiver
  implements IStockMarketRobotStrategySignalReceiver
{
  TAG = "TinkoffBetterSignalReceiver";
  Logger = new Logger();

  private signalRealizations: Record<string, SignalRealization> = {};

  private config: ITinkoffBetterSignalReceiverConfig;
  constructor(config: ITinkoffBetterSignalReceiverConfig) {
    this.config = config;
  }

  private isWorking = false;
  private isClosing = false;

  private terminatable = new Terminatable();

  private processingSignals = 0;
  private finishWaiters: (() => any)[] = [];

  private startProcessingSignal() {
    this.processingSignals++;
  }
  private stopProcessingSignal() {
    this.processingSignals--;
    if (this.processingSignals === 0) {
      this.finishWaiters.forEach((waiter) => waiter());
      this.finishWaiters = [];
    }
  }

  getSignalRealizations() {
    return this.signalRealizations;
  }

  async receive(signal: IStockMarketRobotStrategySignal) {
    if (!this.isWorking || this.isClosing) {
      return;
    }

    const { lotsPerBet, accountId, services } = this.config;
    const { robotId, instrumentFigi, lastCandle } = signal;
    const { ordersService } = services;

    this.Logger.debug(this.TAG, `Receive signal: ${JSON.stringify(signal)}`);

    const signalId = uuidv5(
      `${robotId}$${instrumentFigi}${lastCandle.time.toString()}`,
      Globals.uuidNamespace
    );

    if (this.signalRealizations[signalId]) {
      this.Logger.warn(
        this.TAG,
        `Reject duplication signal: ${JSON.stringify(signalId)}`
      );
      return;
    }

    this.signalRealizations[signalId] = new SignalRealization(signal);
    this.startProcessingSignal();

    // Post openOrder
    const openOrderId = signalId;
    const completedOpenOrder = await promisable()
      .then(() =>
        ordersService.postMarketOrder({
          instrumentFigi: signal.instrumentFigi,
          orderDirection:
            signal.predictAction === StrategyPredictAction.BUY
              ? OrderDirection.BUY
              : OrderDirection.SELL,
          lots: lotsPerBet,
          accountId,
          orderId: openOrderId,
        })
      )
      .then((openOrder) => {
        this.signalRealizations[signalId].setOpenOrderId(openOrder.id);
        return this.waitForCompleteOrder(openOrder);
      })
      .catch((e) => {
        this.signalRealizations[signalId].handleError(
          SignalRealizationErrorReason.POST_OPEN_ORDER,
          e.message
        );
      });

    // If get error post openOrder
    if (!completedOpenOrder) {
      this.stopProcessingSignal();
      return;
    } else if (!this.isWorking) {
      this.stopProcessingSignal();
      this.signalRealizations[signalId].handleError(
        SignalRealizationErrorReason.FATAL,
        "Terminated after post openOrder!"
      );
      return;
    }

    // Wait for resolver gets satisfy price
    const waitForTakeProfitOrStopLossSuccessful =
      await this.waitForCanStopLossOrTakeProfit(completedOpenOrder)
        .then(() => true)
        .catch((e) => {
          this.signalRealizations[signalId].handleError(
            SignalRealizationErrorReason.FATAL,
            e.message
          );
          return false;
        });

    // If get error on wait
    if (!waitForTakeProfitOrStopLossSuccessful) {
      this.stopProcessingSignal();
      return;
    } else if (!this.isWorking) {
      this.stopProcessingSignal();
      this.signalRealizations[signalId].handleError(
        SignalRealizationErrorReason.FATAL,
        "Terminated on get takeProfit/stopLoss signal!"
      );
      return;
    }

    // Post closeOrder
    const closeOrderId = uuidv4();
    const completedCloseOrder = await ordersService
      .postMarketOrder({
        instrumentFigi: signal.instrumentFigi,
        orderDirection:
          signal.predictAction === StrategyPredictAction.BUY
            ? OrderDirection.SELL
            : OrderDirection.BUY,
        lots: lotsPerBet,
        accountId,
        orderId: closeOrderId,
      })
      .then((closeOrder) => {
        this.signalRealizations[signalId].setCloseOrderId(closeOrder.id);
        return this.waitForCompleteOrder(closeOrder);
      })
      .catch((e) => {
        this.signalRealizations[signalId].handleError(
          SignalRealizationErrorReason.POST_CLOSE_ORDER,
          e.message
        );
      });

    // If post closeOrder successful - finish signal processing
    if (completedCloseOrder) {
      this.stopProcessingSignal();
      return;
    } else if (!this.isWorking) {
      this.stopProcessingSignal();
      this.signalRealizations[signalId].handleError(
        SignalRealizationErrorReason.FATAL,
        "Terminated after post closeOrder!"
      );
      return;
    }

    // If post close order failed - cancel open order
    const revertOpenOrderId = uuidv4();
    await ordersService
      .postMarketOrder({
        instrumentFigi: completedOpenOrder.instrumentFigi,
        orderDirection:
          completedOpenOrder.direction === OrderDirection.BUY
            ? OrderDirection.SELL
            : OrderDirection.BUY,
        lots: lotsPerBet,
        accountId,
        orderId: revertOpenOrderId,
      })
      .then((revertOpenOrder) => {
        this.signalRealizations[signalId].setRevertOpenOrderId(
          revertOpenOrder.id
        );
        return this.waitForCompleteOrder(revertOpenOrder);
      })
      .catch((e) => {
        this.signalRealizations[signalId].handleError(
          SignalRealizationErrorReason.REVERT_OPEN_ORDER,
          e.message
        );
      });

    this.stopProcessingSignal();
  }

  private async waitForCanStopLossOrTakeProfit(order: CompletedOrder) {
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

    return await new Promise<void>((res) => {
      if (!this.isWorking) {
        res();
        return;
      }

      let unsubscribeLastPrice = noop;
      unsubscribeLastPrice = marketService.subscribeLastPrice(
        {
          figi: order.instrumentFigi,
        },
        async (price) => {
          if (takeProfit.lte(price) || stopLoss.gte(price)) {
            this.Logger.debug(
              this.TAG,
              `Fix signal open order: ${JSON.stringify(order)}`
            );

            unsubscribeLastPrice();
            res();
          }
        }
      );

      this.terminatable.notifyOnTerminate(() => {
        unsubscribeLastPrice();
        res();
      });
    });
  }

  private async waitForCompleteOrder(
    order: UncompletedOrder
  ): Promise<CompletedOrder | undefined> {
    const { services, accountId, updateOrderStateInterval } = this.config;
    const { ordersService } = services;

    while (this.isWorking) {
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
        await sleep(updateOrderStateInterval, this.terminatable);
        continue;
      }

      throw new Error(
        `Order was completed with not expected status: ${currentOrderState.status}`
      );
    }
  }

  start() {
    this.isWorking = true;
    this.isClosing = false;
  }

  // Waits for all signal resolve
  stop() {
    this.isClosing = true;
    return new Promise<void>((res) => {
      if (this.processingSignals > 0) {
        this.finishWaiters.push(() => {
          this.isWorking = false;
          res();
        });
      } else {
        this.isWorking = false;
        res();
      }
    });
  }

  // Terminate all processing signals
  forceStop() {
    this.isWorking = false;
    this.terminatable.terminate();

    return this.stop();
  }
}

function promisable() {
  return new Promise<void>((res) => res());
}
