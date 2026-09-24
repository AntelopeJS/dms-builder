import {
  BasicDataModel,
  Field,
  Fixture,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { PLAYGROUND_SCHEMA } from "../schema";

const ORDERS_TABLE = "orders";

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

/**
 * Six months of orders, inserted by `RegisterSchema(PLAYGROUND_SCHEMA)` while
 * the collection is still empty. Enough rows for a monthly series to have a
 * shape, and enough unpaid ones that filtering on `status` visibly changes it.
 * Drop the `orders` collection to re-seed.
 */
const DEMO_ORDERS: Array<Partial<Order>> = [
  { amount: 120, status: "paid", createdAt: daysAgo(165) },
  { amount: 80, status: "paid", createdAt: daysAgo(160) },
  { amount: 45, status: "refunded", createdAt: daysAgo(155) },
  { amount: 210, status: "paid", createdAt: daysAgo(135) },
  { amount: 95, status: "paid", createdAt: daysAgo(130) },
  { amount: 60, status: "pending", createdAt: daysAgo(125) },
  { amount: 310, status: "paid", createdAt: daysAgo(105) },
  { amount: 140, status: "paid", createdAt: daysAgo(100) },
  { amount: 75, status: "refunded", createdAt: daysAgo(95) },
  { amount: 260, status: "paid", createdAt: daysAgo(75) },
  { amount: 180, status: "paid", createdAt: daysAgo(70) },
  { amount: 90, status: "pending", createdAt: daysAgo(65) },
  { amount: 420, status: "paid", createdAt: daysAgo(45) },
  { amount: 230, status: "paid", createdAt: daysAgo(40) },
  { amount: 55, status: "refunded", createdAt: daysAgo(35) },
  { amount: 380, status: "paid", createdAt: daysAgo(15) },
  { amount: 195, status: "paid", createdAt: daysAgo(10) },
  { amount: 110, status: "pending", createdAt: daysAgo(5) },
];

@RegisterTable(ORDERS_TABLE, PLAYGROUND_SCHEMA)
@Fixture(() => DEMO_ORDERS)
export class Order extends Table {
  @Field("string") declare _id: string;

  @Field("number") declare amount: number;
  @Index() @Field("string") declare status: string;
  @Index() @Field("date") declare createdAt: Date;
}

export class OrderModel extends BasicDataModel(Order, ORDERS_TABLE) {
  chartCard() {
    return this.table
      .group("status", (rows, group) => ({ x: group, y: rows.count() }))
      .orderBy("x", "asc");
  }

  chartCard2() {
    return this.table
      .group("status", (rows, group) => ({ x: group, y: rows.count() }))
      .orderBy("x", "desc");
  }
}
