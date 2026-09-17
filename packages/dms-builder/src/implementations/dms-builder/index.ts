import type {
  AddBlockInput,
  AddQueryInput,
  BlockCatalog,
  BlockPath,
  CategoryRef,
  CategorySummary,
  CreateCategoryInput,
  CreatePageInput,
  CreateResourceInput,
  DeleteResourceOpts,
  EditableCategoryMeta,
  EditablePageMeta,
  EditableResourceMeta,
  FieldAspects,
  FieldPath,
  FieldSpec,
  MoveDest,
  MutationOpts,
  OpResult,
  PageDraft,
  PageLayoutPreview,
  PageRef,
  PageStructure,
  PageSummary,
  QueryPreview,
  QueryPreviewRequest,
  QueryRef,
  QueryTemplateDescriptor,
  RefreshScope,
  ResourceFiles,
  ResourceRef,
  ResourceStructure,
  ResourceSummary,
} from "@antelopejs/interface-dms-builder";
import { buildCatalog, invalidateCatalog } from "./engine/catalog";
import { addBlock, configureBlock } from "./engine/ops";
import {
  configureCategory,
  createCategory,
  deleteCategory,
} from "./engine/ops-categories";
import {
  configurePage,
  createPage,
  deletePage,
  moveBlock,
  removeBlock,
} from "./engine/ops-blocks";
import { setPageBlocks } from "./engine/page-draft";
import { buildPageStructure } from "./engine/page-structure";
import { previewLayout } from "./engine/preview";
import { runQueryPreview } from "./engine/query-preview";
import { addQuery, configureQuery, removeQuery } from "./engine/query-ops-emit";
import { listQueryTemplates } from "./engine/query-template";
import { registerBuiltinQueryTemplates } from "./engine/query-template-emit";
import { listResourceSummaries } from "./engine/resource-index";
import { createResource } from "./engine/resource-ops";
import {
  addField,
  configureField,
  configureResource,
  deleteResource,
  removeField,
} from "./engine/resource-ops-delete";
import { buildResourceStructure } from "./engine/resource-structure";
import {
  invalidateSourceIndex,
  listCategorySummaries,
  listPageSummaries,
} from "./engine/source-index";

// Every operation below reaches the template registry — compiling a query, or
// recognizing one already written — so it is filled as this module loads.
registerBuiltinQueryTemplates();

export async function ListPages(): Promise<PageSummary[]> {
  return listPageSummaries();
}

export async function ListCategories(): Promise<CategorySummary[]> {
  return listCategorySummaries();
}

export async function GetCatalog(): Promise<BlockCatalog> {
  return buildCatalog();
}

export async function GetPageStructure(
  ref: PageRef,
): Promise<OpResult<PageStructure>> {
  return buildPageStructure(ref);
}

export async function SetPageBlocks(
  page: PageRef,
  draft: PageDraft,
  opts?: MutationOpts,
): Promise<OpResult<{ version: string }>> {
  return setPageBlocks(page, draft, opts);
}

export async function PreviewQuery(
  request: QueryPreviewRequest,
): Promise<OpResult<QueryPreview>> {
  return runQueryPreview(request);
}

export async function PreviewLayout(
  page: PageRef,
  draft: PageDraft,
): Promise<OpResult<PageLayoutPreview>> {
  return previewLayout(page, draft);
}

export async function RefreshSourceIndex(scope?: RefreshScope): Promise<void> {
  invalidateSourceIndex();
  if (!scope?.page) {
    invalidateCatalog();
  }
}

export async function CreatePage(
  input: CreatePageInput,
): Promise<OpResult<{ ref: PageRef; filepath: string }>> {
  return createPage(input);
}

export async function ConfigurePage(
  ref: PageRef,
  patch: Partial<EditablePageMeta>,
  opts?: { expectedVersion?: string },
): Promise<OpResult<{ ref: PageRef }>> {
  return configurePage(ref, patch, opts);
}

export async function DeletePage(
  ref: PageRef,
  opts?: { expectedVersion?: string },
): Promise<OpResult> {
  return deletePage(ref, opts);
}

export async function CreateCategory(
  input: CreateCategoryInput,
): Promise<OpResult<{ ref: CategoryRef }>> {
  return createCategory(input);
}

export async function ConfigureCategory(
  ref: CategoryRef,
  patch: Partial<EditableCategoryMeta>,
): Promise<OpResult> {
  return configureCategory(ref, patch);
}

export async function DeleteCategory(ref: CategoryRef): Promise<OpResult> {
  return deleteCategory(ref);
}

export async function AddBlock(
  input: AddBlockInput,
  opts?: { expectedVersion?: string },
): Promise<OpResult<{ path: BlockPath }>> {
  return addBlock(input, opts);
}

export async function ConfigureBlock(
  path: BlockPath,
  patch: Record<string, unknown>,
  opts?: {
    replace?: boolean;
    meta?: Record<string, unknown>;
    expectedVersion?: string;
  },
): Promise<OpResult> {
  return configureBlock(path, patch, opts);
}

export async function MoveBlock(
  path: BlockPath,
  dest: MoveDest,
  opts?: { expectedVersion?: string },
): Promise<OpResult> {
  return moveBlock(path, dest, opts);
}

export async function RemoveBlock(
  path: BlockPath,
  opts?: { expectedVersion?: string },
): Promise<OpResult> {
  return removeBlock(path, opts);
}

export async function CreateResource(
  input: CreateResourceInput,
): Promise<OpResult<{ ref: ResourceRef; files: ResourceFiles }>> {
  return createResource(input);
}

export async function ConfigureResource(
  ref: ResourceRef,
  patch: EditableResourceMeta,
  opts?: MutationOpts,
): Promise<OpResult> {
  return configureResource(ref, patch, opts);
}

export async function DeleteResource(
  ref: ResourceRef,
  opts?: DeleteResourceOpts,
): Promise<OpResult> {
  return deleteResource(ref, opts);
}

export async function AddField(
  ref: ResourceRef,
  field: FieldSpec,
  opts?: MutationOpts,
): Promise<OpResult<{ path: FieldPath }>> {
  return addField(ref, field, opts);
}

export async function ConfigureField(
  path: FieldPath,
  patch: Partial<FieldAspects>,
  opts?: MutationOpts,
): Promise<OpResult> {
  return configureField(path, patch, opts);
}

export async function RemoveField(
  path: FieldPath,
  opts?: MutationOpts,
): Promise<OpResult> {
  return removeField(path, opts);
}

export async function ListResources(): Promise<ResourceSummary[]> {
  return listResourceSummaries();
}

export async function GetResourceStructure(
  ref: ResourceRef,
): Promise<OpResult<ResourceStructure>> {
  return buildResourceStructure(ref);
}

export async function ListQueryTemplates(
  resourceType?: string,
): Promise<QueryTemplateDescriptor[]> {
  return listQueryTemplates(resourceType);
}

export async function AddQuery(
  page: PageRef,
  input: AddQueryInput,
  opts?: MutationOpts,
): Promise<OpResult<{ query: QueryRef; route: string }>> {
  return addQuery(page, input, opts);
}

export async function RemoveQuery(
  query: QueryRef,
  opts?: MutationOpts,
): Promise<OpResult> {
  return removeQuery(query, opts);
}

export async function ConfigureQuery(
  query: QueryRef,
  patch: Partial<AddQueryInput>,
  opts?: MutationOpts,
): Promise<OpResult> {
  return configureQuery(query, patch, opts);
}
