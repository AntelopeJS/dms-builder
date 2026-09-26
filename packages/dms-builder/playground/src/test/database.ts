import {
  BasicDataModel,
  Field,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

const tableName = "tests";

@RegisterTable(tableName, CORE_SCHEMA_NAME)
export class Test extends Table {
  @Field("string") declare _id: string;
  @Field("string") declare title: string;
}
export class TestModel extends BasicDataModel(Test, tableName) {}
