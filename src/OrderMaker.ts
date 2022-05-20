import { OrderDirection } from "./CommonTypes";
import { Order } from "./Order";

export interface IOrderManagerPostOrderOptions {
  instrumentFigi: string;
  orderDirection: OrderDirection;

  price: number;
  lots: number;

  orderId: string;
  accountId: string;
}

export interface IOrderManager {
  postOrder: (options: IOrderManagerPostOrderOptions) => void;
  cancelOrder: (orderId: string) => void;
}

// export interface IOrdersListener {
//   listenOrder: () => void;
// }

// export interface IOrderCloserBot {
//   closeWhenPossible: (order: Order) => void;
// }
