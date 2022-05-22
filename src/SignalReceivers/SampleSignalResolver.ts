import {
  CompletedOrder,
  OrderExecutionStatus,
  UncompletedOrder,
} from "../Types/Order";
import { OrderDirection } from "../Types/Common";
import { noop, SignalUtils, sleep, Terminatable } from "../Helpers/Utils";
import {
  SignalRealization,
  SignalRealizationErrorReason,
} from "../Types/Signal";

import Big from "big.js";
import { v4 as uuidv4 } from "uuid";
import { StrategyPredictAction } from "../Types/Strategy";

import {
  IStockMarketRobotStrategySignal,
  IStockMarketRobotStrategySignalReceiver,
} from "../StockMarketRobotTypes";
import { Logger } from "../Helpers/Logger";
import { IServices } from "../Services/IServices";
import { Globals } from "../Globals";

interface ISampleSignalResolverConfig {
  accountId: string;

  lotsPerBet: number;
  maxConcurrentBets: number;

  commission: number;

  takeProfitPercent: number;
  stopLossPercent: number;

  forceCloseOnFinish?: boolean;
}

export class SampleSignalResolver
  implements IStockMarketRobotStrategySignalReceiver
{
  TAG = "SampleSignalResolver";
  Logger = new Logger();

  private signalRealizations: Record<string, SignalRealization> = {};

  private config: ISampleSignalResolverConfig;
  private services: IServices;

  constructor(config: ISampleSignalResolverConfig, services: IServices) {
    if (typeof config.accountId !== "string") {
      throw new Error("accountId incorrect or not specified!");
    }

    if (typeof config.lotsPerBet !== "number" || config.lotsPerBet <= 0) {
      throw new Error("lotsPerBet incorrect or not specified!");
    }

    if (typeof config.commission !== "number" || config.commission <= 0) {
      throw new Error("commission incorrect or not specified!");
    }

    if (
      typeof config.maxConcurrentBets !== "number" ||
      config.maxConcurrentBets <= 0
    ) {
      throw new Error("maxConcurrentBets incorrect or not specified!");
    }

    if (
      typeof config.stopLossPercent !== "number" ||
      config.stopLossPercent <= 0
    ) {
      throw new Error("stopLossPercent incorrect or not specified!");
    }

    if (
      typeof config.takeProfitPercent !== "number" ||
      config.takeProfitPercent <= 0
    ) {
      throw new Error("takeProfitPercent incorrect or not specified!");
    }

    if (typeof config.forceCloseOnFinish !== "boolean") {
      config.forceCloseOnFinish = true;
    }

    this.config = config;
    this.services = services;
  }

  private isWorking = true;
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

    const { lotsPerBet, accountId, maxConcurrentBets } = this.config;
    const { ordersService, instrumentsService } = this.services;
    const { instrumentFigi } = signal;

    this.Logger.debug(this.TAG, `Receive signal: ${JSON.stringify(signal)}`);
    const signalId = SignalUtils.getId(signal);

    if (this.processingSignals >= maxConcurrentBets) {
      this.Logger.warn(
        this.TAG,
        `Reject signal because maxConcurrentBets limit`
      );
      return;
    }

    if (this.signalRealizations[signalId]) {
      this.Logger.warn(this.TAG, `Reject duplication signal: ${signalId}`);
      return;
    }

    this.signalRealizations[signalId] = new SignalRealization(signal);
    this.startProcessingSignal();

    const instrument = await instrumentsService
      .getInstrumentByFigi({
        figi: instrumentFigi,
      })
      .catch((e) => {
        this.signalRealizations[signalId].handleError(
          SignalRealizationErrorReason.FATAL,
          `Failed to load instrument info: ${e.message}`
        );
      });

    if (!instrument) {
      this.stopProcessingSignal();
      return;
    }

    if (!instrument.tradable) {
      this.stopProcessingSignal();
      this.signalRealizations[signalId].handleError(
        SignalRealizationErrorReason.FATAL,
        `Insrument not tradable!`
      );
      return;
    }

    this.Logger.debug(
      this.TAG,
      `Post open order for signal: ${JSON.stringify(signal)}`
    );

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
    await ordersService
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

    this.stopProcessingSignal();
  }

  private waitForCanStopLossOrTakeProfit(
    order: CompletedOrder,
    instrumentLot: number
  ) {
    const { takeProfitPercent, stopLossPercent, commission } = this.config;
    const { marketDataStream } = this.services;

    const instrumentPrice = order.totalPrice.div(order.lots).div(instrumentLot);

    const takeProfit = instrumentPrice
      .plus(instrumentPrice.mul(takeProfitPercent))
      .mul(1 + commission);

    const stopLoss = instrumentPrice
      .minus(instrumentPrice.mul(stopLossPercent))
      .mul(1 + commission);

    this.Logger.debug(
      this.TAG,
      `Start wait for stop loss or take profit for order: ${JSON.stringify(
        order
      )}`
    );

    // Even stop was called, its return price
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
              `End wait for stop loss or take profit for order: ${JSON.stringify(
                order
              )}`
            );

            unsubscribeLastPrice();
            res(lastPrice);
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
    const { accountId } = this.config;
    const { ordersService } = this.services;

    this.Logger.debug(
      this.TAG,
      `Start waiting for complete order: ${JSON.stringify(order)}`
    );

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
          const errorMsg = `Total price or total commission is empty, order id: ${currentOrderState.id}`;

          this.Logger.error(this.TAG, errorMsg);
          throw new Error(errorMsg);
        }
        this.Logger.debug(
          this.TAG,
          `End waiting for complete order: ${JSON.stringify(order)}`
        );
        return currentOrderState as CompletedOrder;
      }

      if (
        currentOrderState.status === OrderExecutionStatus.NEW ||
        currentOrderState.status === OrderExecutionStatus.PARTIALLY_COMPLETED
      ) {
        await this.sleepIfWorking(Globals.updateOrderStateInterval);
        continue;
      }

      const errorMsg = `Order(${currentOrderState.id}) was completed with not expected status: ${currentOrderState.status}`;
      this.Logger.error(this.TAG, errorMsg);
      throw new Error(errorMsg);
    }
  }

  // Waits for all signals resolves
  private stop() {
    this.isClosing = true;
    this.Logger.debug(this.TAG, `Start stopping signal resolver ...`);

    return new Promise<void>((res) => {
      if (this.processingSignals > 0) {
        this.finishWaiters.push(() => {
          this.Logger.debug(this.TAG, `Finish stopping signal resolver ...`);

          this.isWorking = false;
          res();
        });
      } else {
        this.Logger.debug(this.TAG, `Finish stopping signal resolver ...`);

        this.isWorking = false;
        res();
      }
    });
  }

  // Terminate all processing signals
  private forceStop() {
    this.isWorking = false;
    this.terminatable.terminate();

    return this.stop();
  }

  async finishWork() {
    if (this.config.forceCloseOnFinish) {
      await this.forceStop();
    } else {
      await this.stop();
    }

    return this.signalRealizations;
  }

  private async sleepIfWorking(ms: number) {
    if (this.isWorking) {
      await sleep(ms, this.terminatable);
    }
  }
}

// Кейсы остановки робота
// - Выставлен ордер на покупку (статус не подтвержден)
//      : Бот заканчивает работу без открытия встречного ордера
// - Выставлен ордер на покупку (статус подтвержден)
//      : Бот выставляет встречный ордер
// - Выставлен ордер на sl/tp (статус не подтвержден)
//      : Бот ждет до конца выполнения
// - Выставлен ордер на sl/tp (статус подтвержден)
//      : Nothing
