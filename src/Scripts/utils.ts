import Big from "big.js";
import { existsSync, mkdirSync } from "fs";
import { OrderDirection } from "../Types/Common";
import { CompletedOrder, Order, OrderExecutionStatus } from "../Types/Order";

export function showOrdersStatistic(orders: Order[]) {
  let profit = new Big(0);
  let sumBetPrices = new Big(0);

  const completedOrders = orders.filter(
    (order) =>
      order.status === OrderExecutionStatus.COMPLETED &&
      order.totalPrice &&
      order.totalCommission
  ) as CompletedOrder[];

  completedOrders.forEach((order) => {
    if (order.direction === OrderDirection.BUY) {
      profit = profit.minus(order.totalPrice.plus(order.totalCommission));
    } else {
      profit = profit.plus(order.totalPrice.minus(order.totalCommission));
    }

    sumBetPrices = sumBetPrices.plus(order.totalPrice);
  });

  console.log("Total posted orders: ", orders.length);
  console.log("Total completed orders: ", completedOrders.length);

  if (completedOrders.length > 0) {
    const avgBetSize = sumBetPrices.div(completedOrders.length);

    console.log(
      `Total profit: ${profit.toString()}, (in percent: ${profit
        .div(avgBetSize)
        .mul(100)
        .toFixed(2)}%)`
    );
  }
}

export function createFolder(dirName: string) {
  if (!existsSync(dirName)) {
    mkdirSync(dirName);
  }
}
