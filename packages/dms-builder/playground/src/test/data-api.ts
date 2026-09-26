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
  Optional,
} from "@antelopejs/interface-data-api/metadata";
import { Model } from "@antelopejs/interface-database-decorators";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import {
  Column,
  Select,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { Test, TestModel } from "./database";

@RegisterDataController()
export class testDataAPI extends DataController(
  Test,
  TableViewRoutes.All,
  Controller("/api/test"),
) {
  @ModelReference() @Model(TestModel) declare model: TestModel;

  @Select() @Listable() @Access(AccessMode.ReadOnly) declare _id: string;

  @Searchable()
  @Select()
  @Listable()
  @Column({ name: "Title", type: new DefaultDataTypes.StringType() })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare title: string;
}
