import Big from "big.js";
import { stat } from "fs";
import { CandleInterval, OrderDirection, Quotation } from "./CommonTypes";
import { TerminateError } from "./Exceptions";
import { Globals } from "./Globals";
import { OrderExecutionStatus } from "./Order";

export class Terminatable {
  isTerminated = false;
  notifyers: ((e: Error) => any)[] = [];

  error = new TerminateError("terminated!");

  notifyOnTerminate(notifyer: (e: Error) => any) {
    this.notifyers.push(notifyer);
    return () => {
      this.notifyers = this.notifyers.filter((notify) => notify !== notifyer);
      return undefined;
    };
  }

  terminate() {
    const self = this;
    this.notifyers.forEach((notify) => notify(self.error));
  }
}

export const noop = () => undefined;
export const sleep = (
  ms: number,
  terminatable: Terminatable | undefined = undefined
) =>
  new Promise((res, reject) => {
    let unsubTerminate = noop;
    if (terminatable) {
      unsubTerminate = terminatable.notifyOnTerminate((e) => reject(e));
    }

    setTimeout(() => {
      unsubTerminate();
      res(undefined);
    }, ms);
  });

export const SEC_IN_MS = 1000;
export const MIN_IN_MS = SEC_IN_MS * 60;
export const FIVE_MIN_IN_MS = 5 * MIN_IN_MS;
export const HOUR_IN_MS = MIN_IN_MS * 60;
export const FOUR_HOURS_IN_MS = 4 * HOUR_IN_MS;
export const DAY_IN_MS = HOUR_IN_MS * 24;
export const WEEK_IN_MS = DAY_IN_MS * 7;

export enum CompareResult {
  EQUALS,
  BIGGER,
  SMALLER,
}

export class QuotationUtils {
  static toBig(quotation: Quotation) {
    const beforeFloatZeros = new Array(9 - quotation.nano.toString().length)
      .fill("0")
      .join("");
    return Big(`${quotation.units}.${beforeFloatZeros}${quotation.nano}`);
  }

  static fromBig(big: Big): Quotation {
    const numStr = big.c.join("");

    const bigStr = big.toString();
    const dotIndex = bigStr.indexOf(".");

    const integerPart = dotIndex !== -1 ? bigStr.slice(0, dotIndex) : bigStr;
    const doublePart = dotIndex !== -1 ? numStr.slice(dotIndex) : "0";

    const nanoStr =
      doublePart + new Array(9 - doublePart.length).fill("0").join("");

    return { units: integerPart, nano: +nanoStr };
  }
}

export class OrdersUtils {
  static getExecutionStatusFromString(statusStr: string): OrderExecutionStatus {
    if (statusStr === "EXECUTION_REPORT_STATUS_FILL") {
      return OrderExecutionStatus.COMPLETED;
    } else if (statusStr === "EXECUTION_REPORT_STATUS_REJECTED") {
      return OrderExecutionStatus.REJECTED;
    } else if (statusStr === "EXECUTION_REPORT_STATUS_CANCELLED") {
      return OrderExecutionStatus.CANCELLED_BY_USER;
    } else if (statusStr === "EXECUTION_REPORT_STATUS_NEW") {
      return OrderExecutionStatus.NEW;
    } else if (statusStr === "EXECUTION_REPORT_STATUS_PARTIALLYFILL") {
      return OrderExecutionStatus.PARTIALLY_COMPLETED;
    }

    throw new Error("Get not specified status!");
  }

  static getDirectionFromString(directionStr: string): OrderDirection {
    if (directionStr === "ORDER_DIRECTION_BUY") {
      return OrderDirection.BUY;
    } else if (directionStr === "ORDER_DIRECTION_SELL") {
      return OrderDirection.SELL;
    }

    if (Globals.isSandbox) {
      return OrderDirection.BUY;
    }

    throw new Error("Get not specified direction!");
  }
}

export class CandleUtils {
  static getCandleTimeStepByInterval(interval: CandleInterval) {
    return candleTimeStep[interval];
  }
}

const candleTimeStep = {
  [CandleInterval.CANDLE_INTERVAL_1_MIN]: MIN_IN_MS,
  [CandleInterval.CANDLE_INTERVAL_5_MIN]: FIVE_MIN_IN_MS,
};
