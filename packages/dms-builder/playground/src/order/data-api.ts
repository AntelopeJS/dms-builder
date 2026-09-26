import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { Model } from "@antelopejs/interface-database-decorators";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Column,
  Select,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { Order, OrderModel } from "./database";

// The route is what names the resource: `/api/order` makes it `order`, the ref
// the source editor lists and the reference journey configures a chart from.
@RegisterDataController()
export class orderDataAPI extends DataController(
  Order,
  TableViewRoutes.All,
  Controller("/api/order"),
) {
  @ModelReference()
  @Model(OrderModel)
  declare model: OrderModel;

  @Select()
  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  // A numeric field is what the editor offers as a measure for sum and average.
  @Listable()
  @Sortable()
  @Column({
    name: "Amount",
    type: new DefaultDataTypes.NumberType({ min: 0 }),
    filterable: true,
  })
  @Access(AccessMode.ReadWrite)
  declare amount: number;

  @Listable()
  @Column({
    name: "Status",
    type: new DefaultDataTypes.StringType({ placeholder: "paid" }),
    filterable: true,
  })
  @Access(AccessMode.ReadWrite)
  declare status: string;

  // A date field is what the editor offers as a period bucket, and what a
  // page-wide period binds its `from`/`to` to.
  @Listable()
  @Sortable()
  @Column({
    name: "Created",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
  })
  @Access(AccessMode.ReadWrite)
  declare createdAt: Date;
}
