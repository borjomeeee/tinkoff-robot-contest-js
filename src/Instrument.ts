import { OrderDirection } from "./CommonTypes";

interface IOrderMakerPostOrderOptions {
  orderDirection: OrderDirection;

  instrumentFigi: string;
  accountId: string;

  lots: number;
}

export interface IOrderMaker {
  postOrder: (options: IOrderMakerPostOrderOptions) => void;
}
