import { AnalyseDatabase, GetAnalysis, GetMapping } from "./analysis";
import { PreviewLayout, PreviewQuery, SetPageBlocks } from "./drafts";
import { MapResources } from "./mapping";
import {
  AddBlock,
  ConfigureBlock,
  ConfigureCategory,
  ConfigurePage,
  CreateCategory,
  CreatePage,
  DeleteCategory,
  DeletePage,
  GetCatalog,
  GetPageStructure,
  ListCategories,
  ListDataSources,
  ListPages,
  MoveBlock,
  RefreshSourceIndex,
  RemoveBlock,
} from "./operations";
import {
  AddModule,
  ConfigureModule,
  ConfigureProject,
  CreateLocalModule,
} from "./project";
import {
  AddQuery,
  ConfigureQuery,
  ListQueryTemplates,
  RemoveQuery,
} from "./queries";
import {
  AddField,
  ConfigureField,
  ConfigureResource,
  CreateResource,
  DeleteResource,
  GetResourceStructure,
  ListResources,
  RemoveField,
} from "./resources";

/**
 * Every operation of the builder, by the name it is exported under.
 *
 * A caller that picks an operation at run time, such as a route that forwards a
 * named request, indexes this map and keeps each operation's parameter and
 * result types, rather than reading the namespace import as an untyped record.
 */
export const Operations = {
  AddBlock,
  AddField,
  AddModule,
  AddQuery,
  AnalyseDatabase,
  ConfigureBlock,
  ConfigureCategory,
  ConfigureField,
  ConfigureModule,
  ConfigurePage,
  ConfigureProject,
  ConfigureQuery,
  ConfigureResource,
  CreateCategory,
  CreateLocalModule,
  CreatePage,
  CreateResource,
  DeleteCategory,
  DeletePage,
  DeleteResource,
  GetAnalysis,
  GetCatalog,
  GetMapping,
  GetPageStructure,
  GetResourceStructure,
  ListCategories,
  ListDataSources,
  ListPages,
  ListQueryTemplates,
  ListResources,
  MapResources,
  MoveBlock,
  PreviewLayout,
  PreviewQuery,
  RefreshSourceIndex,
  RemoveBlock,
  RemoveField,
  RemoveQuery,
  SetPageBlocks,
};

/** The name of one operation in `Operations`. */
export type OperationName = keyof typeof Operations;
