import Big from "big.js";
import { OrderDirection } from "./CommonTypes";

export enum OrderExecutionStatus {
  COMPLETED,
  REJECTED,
  CANCELLED_BY_USER,
  NEW,
  PARTIALLY_COMPLETED,
}
export interface UncompletedOrder {
  id: string;
  accountId: string;

  instrumentFigi: string;
  direction: OrderDirection;
  status: OrderExecutionStatus;

  lots: number;
}

export interface OrderTrade {
  orderId: string;

  currentPrice: number;
  currentLots: number;
}

export interface Order extends UncompletedOrder {
  totalPrice?: Big;
  totalCommission?: Big;

  time?: number;
}

export interface CompletedOrder extends Order {
  totalPrice: Big;
  totalCommission: Big;
}
