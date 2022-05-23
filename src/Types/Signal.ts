import { ICandlesRobotStrategySignal } from "../CandlesRobotTypes";

export enum SignalRealizationErrorReason {
  POST_OPEN_ORDER = "post-open-order",
  POST_CLOSE_ORDER = "post-close-order",
  FATAL = "falal",
}
export interface ISignalRealizationError {
  reason: SignalRealizationErrorReason;
  error: string;
}

export enum SignalRealizationStatus {
  PROCESSING = "processing",
  FAILED = "failed",
  SUCCESSFUL = "successful",
}

export interface ICandlesRobotSignalRealization {
  signal: ICandlesRobotStrategySignal;

  openOrderId?: string;
  closeOrderId?: string;

  status: SignalRealizationStatus;
  error: ISignalRealizationError | null;
}

export class SignalRealization implements ICandlesRobotSignalRealization {
  signal: ICandlesRobotStrategySignal;

  openOrderId?: string;
  closeOrderId?: string;

  status: SignalRealizationStatus = SignalRealizationStatus.PROCESSING;
  error: ISignalRealizationError | null = null;

  constructor(signal: ICandlesRobotStrategySignal) {
    this.signal = signal;
  }

  setOpenOrderId(orderId: string) {
    this.openOrderId = orderId;
  }

  setCloseOrderId(orderId: string) {
    if (this.openOrderId) {
      this.closeOrderId = orderId;
      this.status = SignalRealizationStatus.SUCCESSFUL;
    } else {
      throw new Error("Can't assign closeOrder before openOrder!");
    }
  }

  handleError(reason: SignalRealizationErrorReason, error: Error) {
    this.status = SignalRealizationStatus.FAILED;
    this.error = {
      reason,
      error: error.message,
    };
  }
}
