import {
  IStockMarketRobotStrategySignal,
  IStockMarketRobotStrategySignalReceiver,
} from "./Bot";

import { Logger } from "./Logger";

import {
  IInstrumentsService,
  IMarketDataStream,
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
import Big from "big.js";

interface ITinkoffBetterSignalReceiverConfig {
  accountId: string;

  lotsPerBet: number;
  maxConcurrentBets: number;

  commission: number;

  takeProfitPercent: number;
  stopLossPercent: number;
  updateOrderStateInterval: number;

  services: {
    ordersService: IOrdersService;
    marketDataStream: IMarketDataStream;
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

  processingSignals = 0;
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

    const { lotsPerBet, accountId, services, maxConcurrentBets } = this.config;
    const { robotId, instrumentFigi, lastCandle } = signal;
    const { ordersService, instrumentsService } = services;

    this.Logger.debug(this.TAG, `Receive signal: ${JSON.stringify(signal)}`);

    const signalId = uuidv5(
      `${robotId}$${instrumentFigi}${lastCandle.time.toString()}`,
      Globals.uuidNamespace
    );

    if (this.processingSignals >= maxConcurrentBets) {
      this.Logger.warn(
        this.TAG,
        "Reject signal because maxConcurrentBets limit!"
      );
      return;
    }

    if (this.signalRealizations[signalId]) {
      this.Logger.warn(
        this.TAG,
        `Reject duplication signal: ${JSON.stringify(signalId)}`
      );
      return;
    }

    this.signalRealizations[signalId] = new SignalRealization(signal);
    this.startProcessingSignal();

    const instrument = await instrumentsService.getInstrumentByFigi({
      figi: instrumentFigi,
    });

    if (!instrument.tradable) {
      this.stopProcessingSignal();
      this.signalRealizations[signalId].handleError(
        SignalRealizationErrorReason.FATAL,
        `Insrument not tradable!`
      );
      return;
    }

    // Post openOrder
    const openOrderId = signalId;
    const completedOpenOrder = await ordersService
      .postMarketOrder({
        instrumentFigi: signal.instrumentFigi,
        orderDirection:
          signal.predictAction === StrategyPredictAction.BUY
            ? OrderDirection.BUY
            : OrderDirection.SELL,
        lots: lotsPerBet,
        accountId,
        orderId: openOrderId,

        _price: signal.lastCandle.close,
      })
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

    // If get error on post openOrder
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
    const stopLossOrTakeProfitPrice = await this.waitForCanStopLossOrTakeProfit(
      completedOpenOrder,
      instrument.lot
    ).catch((e) => {
      this.signalRealizations[signalId].handleError(
        SignalRealizationErrorReason.FATAL,
        e.message
      );
    });

    // If get error on wait
    if (!stopLossOrTakeProfitPrice) {
      this.stopProcessingSignal();
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

        _price: stopLossOrTakeProfitPrice,
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

    // If get error on post closeOrder
    if (!completedCloseOrder) {
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

    this.stopProcessingSignal();
  }

  private waitForCanStopLossOrTakeProfit(
    order: CompletedOrder,
    instrumentLot: number
  ) {
    const { services, takeProfitPercent, stopLossPercent, commission } =
      this.config;
    const { marketDataStream } = services;

    const instrumentPrice = order.totalPrice.div(order.lots).div(instrumentLot);

    const takeProfit = instrumentPrice
      .plus(instrumentPrice.mul(takeProfitPercent))
      .mul(1 + commission);

    const stopLoss = instrumentPrice
      .minus(instrumentPrice.mul(stopLossPercent))
      .mul(1 + commission);

    // Even if instance was stopped, its return price
    // Return error if really happines error
    return new Promise<Big | void>((res) => {
      let lastPrice = order.totalPrice
        .minus(order.totalCommission)
        .div(order.lots)
        .div(instrumentLot)
        .mul(1 + commission);

      if (!this.isWorking) {
        res(lastPrice);
        return;
      }

      let unsubscribeLastPrice = noop;
      unsubscribeLastPrice = marketDataStream.subscribeLastPrice(
        {
          figi: order.instrumentFigi,
        },
        async (price) => {
          lastPrice = price.mul(1 + commission);

          if (takeProfit.lte(lastPrice) || stopLoss.gte(lastPrice)) {
            this.Logger.debug(
              this.TAG,
              `Fix signal open order: ${JSON.stringify(order)}`
            );

            unsubscribeLastPrice();
            res(price);
          }
        }
      );

      this.terminatable.notifyOnTerminate(() => {
        unsubscribeLastPrice();
        res(lastPrice);
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
          !currentOrderState.totalCommission
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
