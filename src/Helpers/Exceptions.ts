import { GetCandlesRequest } from "@tinkoff/invest-js/build/generated/tinkoff/public/invest/api/contract/v1/GetCandlesRequest";
import { GetOrdersRequest } from "@tinkoff/invest-js/build/generated/tinkoff/public/invest/api/contract/v1/GetOrdersRequest";
import { GetOrderStateRequest } from "@tinkoff/invest-js/build/generated/tinkoff/public/invest/api/contract/v1/GetOrderStateRequest";
import { InstrumentRequest } from "@tinkoff/invest-js/build/generated/tinkoff/public/invest/api/contract/v1/InstrumentRequest";
import { PostOrderRequest } from "@tinkoff/invest-js/build/generated/tinkoff/public/invest/api/contract/v1/PostOrderRequest";
import { TradingSchedulesRequest } from "@tinkoff/invest-js/build/generated/tinkoff/public/invest/api/contract/v1/TradingSchedulesRequest";

export class SerializableError extends Error {
  protected reason: string;
  constructor(reason: string, message?: string) {
    super(message);
    this.reason = reason;
  }

  toString(): string {
    return JSON.stringify({ reason: this.reason, message: this.message });
  }

  get message() {
    return this.toString();
  }
}

export class TerminateError extends SerializableError {
  constructor() {
    super("terminated", "terminate func was called!");
  }
}

export class InstrumentNotFoundError extends SerializableError {
  constructor(request: InstrumentRequest) {
    super("insrument-not-found", JSON.stringify(request));
  }
}

export class GetInstrumentFatalError extends SerializableError {
  constructor(request: InstrumentRequest, error?: string) {
    super("get-instrument-error", JSON.stringify({ request, error }));
  }
}

export class TradingScheduleNotFound extends SerializableError {
  constructor(exchange: string) {
    super("trading-schedule-not-found", exchange);
  }
}

export class GetTradingScheduleFatalError extends SerializableError {
  constructor(request: TradingSchedulesRequest, error?: string) {
    super("get-trading-schedule-error", JSON.stringify({ request, error }));
  }
}

export class GetCandlesFatalError extends SerializableError {
  constructor(request?: GetCandlesRequest, error?: string) {
    super("get-candles-error", JSON.stringify({ request, error }));
  }
}

export class PostOrderFatalError extends SerializableError {
  constructor(request: PostOrderRequest, error?: string) {
    super(
      "post-order-error",
      JSON.stringify({
        request,
        error,
      })
    );
  }
}

export class GetOrderStateFatalError extends SerializableError {
  constructor(request: GetOrderStateRequest, error?: string) {
    super(
      "get-order-state-error",
      JSON.stringify({
        request,
        error,
      })
    );
  }
}

export class GetAccountOrdersFatalError extends SerializableError {
  constructor(request: GetOrdersRequest, error?: string) {
    super(
      "get-account-orders-error",
      JSON.stringify({
        request,
        error,
      })
    );
  }
}
