import {
  BasicDataModel,
  Field,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

const tableName = "test2s";

@RegisterTable(tableName, CORE_SCHEMA_NAME)
export class Test2 extends Table {
  @Field("string") declare _id: string;
  @Field("string") declare title: string;
}
export class Test2Model extends BasicDataModel(Test2, tableName) {}
