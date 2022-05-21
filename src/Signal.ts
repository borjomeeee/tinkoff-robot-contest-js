import { IStockMarketRobotStrategySignal } from "./Bot";

export enum SignalRealizationErrorReason {
  POST_OPEN_ORDER = "post-open-order",
  POST_CLOSE_ORDER = "post-close-order",
  REVERT_OPEN_ORDER = "revert-open-order",
  FATAL = "falal",
}
export interface ISignalRealizationError {
  reason: SignalRealizationErrorReason;
  msg: string;
}

export enum SignalRealizationStatus {
  PROCESSING = "processing",
  FAILED = "failed",
  SUCCESSFUL = "successful",
}

export interface ISignalRealization {
  signal: IStockMarketRobotStrategySignal;

  openOrderId?: string;
  closeOrderId?: string;
  revertOpenOrderId?: string;

  status: SignalRealizationStatus;
  error: ISignalRealizationError | null;
}

export class SignalRealization implements ISignalRealization {
  signal: IStockMarketRobotStrategySignal;

  openOrderId?: string;
  closeOrderId?: string;
  revertOpenOrderId?: string;

  status: SignalRealizationStatus = SignalRealizationStatus.PROCESSING;
  error: ISignalRealizationError | null = null;

  constructor(signal: IStockMarketRobotStrategySignal) {
    this.signal = signal;
  }

  setOpenOrderId(orderId: string) {
    this.openOrderId = orderId;
  }

  setRevertOpenOrderId(orderId: string) {
    if (this.openOrderId) {
      this.revertOpenOrderId = orderId;
    } else {
      throw new Error("Can't assign revertOpenOrder before openOrder!");
    }
  }

  setCloseOrderId(orderId: string) {
    if (this.openOrderId) {
      this.closeOrderId = orderId;
      this.status = SignalRealizationStatus.SUCCESSFUL;
    } else {
      throw new Error("Can't assign closeOrder before openOrder!");
    }
  }

  handleError(reason: SignalRealizationErrorReason, msg: string) {
    this.status = SignalRealizationStatus.FAILED;
    this.error = {
      reason,
      msg,
    };
  }
}
