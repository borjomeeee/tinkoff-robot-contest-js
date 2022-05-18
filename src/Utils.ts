import Big from "big.js";
import { Quotation } from "./CommonTypes";
import { TerminateError } from "./Exceptions";

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
    this.isTerminated = true;
    const self = this;

    this.notifyers.forEach((notify) => notify(self.error));
  }

  reset() {
    this.isTerminated = false;
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
    return Big(`${quotation.units}.${quotation.nano}`);
  }
}
