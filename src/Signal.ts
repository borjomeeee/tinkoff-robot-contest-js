import { IStockMarketRobotStrategySignal } from "./Bot";

export enum TinkoffBetterSignalRealizationStatus {
  IN_WORK = "in-work",

  FAILED_OPEN_ORDER = "failed-open-order",
  FAILED_CLOSE_ORDER = "failed-close-order",
  FAILED_CLOSE_ORDER_AND_CANCEL_OPEN_ORDER = "failed-close-order-and-open-order",

  SUCCESSFUL = "successful",
}

export interface ITinkoffBetterSignalRealization {
  signal: IStockMarketRobotStrategySignal;

  openOrderId?: string;
  openOrderError?: string;

  closeOrderId?: string;
  closeOrderError?: string;

  status: TinkoffBetterSignalRealizationStatus;
  cancelOpenOrderError?: string;
}

export class TinkoffBetterSignalRealization
  implements ITinkoffBetterSignalRealization
{
  signal: IStockMarketRobotStrategySignal;

  openOrderId?: string;
  openOrderError?: string;

  closeOrderId?: string;
  closeOrderError?: string;

  status: TinkoffBetterSignalRealizationStatus;
  cancelOpenOrderError?: string;

  constructor(signal: IStockMarketRobotStrategySignal) {
    this.signal = signal;
    this.status = TinkoffBetterSignalRealizationStatus.IN_WORK;
  }

  setOpenOrderId(orderId: string) {
    this.openOrderId = orderId;
  }

  setCloseOrderId(orderId: string) {
    if (this.openOrderId) {
      this.closeOrderId = orderId;
      this.status = TinkoffBetterSignalRealizationStatus.SUCCESSFUL;
    } else {
      throw new Error("Can't assign close order before start order!");
    }
  }

  handleOpenOrderError(msg: string) {
    this.openOrderError = msg;
    this.status = TinkoffBetterSignalRealizationStatus.FAILED_OPEN_ORDER;
  }

  handleCloseOrderError(msg: string) {
    this.closeOrderError = msg;
    this.status = TinkoffBetterSignalRealizationStatus.FAILED_CLOSE_ORDER;
  }

  handleCancelOpenOrderError(msg: string) {
    this.cancelOpenOrderError = msg;
    if (
      this.status === TinkoffBetterSignalRealizationStatus.FAILED_CLOSE_ORDER
    ) {
      this.status =
        TinkoffBetterSignalRealizationStatus.FAILED_CLOSE_ORDER_AND_CANCEL_OPEN_ORDER;
    } else {
      throw new Error(
        "Can't set cancel order error, before close order error!"
      );
    }
  }
}
