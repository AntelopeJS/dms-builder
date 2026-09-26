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
import { Test2, Test2Model } from "./database";

@RegisterDataController()
export class test2DataAPI extends DataController(
  Test2,
  TableViewRoutes.All,
  Controller("/api/test2"),
) {
  @ModelReference() @Model(Test2Model) declare model: Test2Model;

  @Select() @Listable() @Access(AccessMode.ReadOnly) declare _id: string;

  @Searchable()
  @Select()
  @Listable()
  @Column({ name: "Title", type: new DefaultDataTypes.StringType() })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare title: string;
}
