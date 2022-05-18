import { OrderDirection } from "./CommonTypes";

export interface Order {
  id: string;

  sessionId: string;
  accountId: string;

  instrumentFigi: string;
  signalCandleCloseTime: number;

  direction: OrderDirection;

  lots: number;
  price: number;
  commission: number;
}
