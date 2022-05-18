export interface IBet {
  instrumentId: string;
  accountId: string;
  authorId: string;

  price: number;
  commision: number;
  lotsAmount: number;

  time: number;
}
