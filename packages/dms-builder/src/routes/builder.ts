import {
  Controller,
  Delete,
  Get,
  JSONBody,
  Parameter,
  Post,
  Put,
} from "@antelopejs/interface-api";
import { AuthTenantOwner } from "@antelopejs/interface-dms/guards";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type {
  AddQueryInput,
  CreateCategoryInput,
  CreatePageInput,
  CreateResourceInput,
  EditableCategoryMeta,
  EditablePageMeta,
  EditableResourceMeta,
  FieldAspects,
  FieldSpec,
  MutationOpts,
  PageDraft,
} from "@antelopejs/interface-dms-builder";
import { getRoutePrefix } from "../config";
import { ROUTES } from "../constants/routes";
import * as engine from "../implementations/dms-builder";
import { resolveProjectRoot } from "../implementations/dms-builder/engine/project";

interface PageBody {
  page: string;
  draft: PageDraft;
  expectedVersion?: string;
}

interface ConfigureCategoryBody {
  category: string;
  patch: Partial<EditableCategoryMeta>;
}

interface ConfigurePageBody {
  page: string;
  patch: Partial<EditablePageMeta>;
  expectedVersion?: string;
}

interface FieldBody {
  resource: string;
  field: FieldSpec;
  expectedVersion?: string;
}

interface ConfigureResourceBody {
  resource: string;
  patch: EditableResourceMeta;
  expectedVersion?: string;
}

interface ConfigureFieldBody {
  path: string;
  patch: Partial<FieldAspects>;
  expectedVersion?: string;
}

interface QueryBody {
  page: string;
  input: AddQueryInput;
  expectedVersion?: string;
}

interface ConfigureQueryBody {
  query: string;
  patch: Partial<AddQueryInput>;
  expectedVersion?: string;
}

function opts(expectedVersion?: string): MutationOpts | undefined {
  return expectedVersion ? { expectedVersion } : undefined;
}

/**
 * The HTTP surface a builder UI drives. Every route is owner-gated, and the
 * controller is only loaded when the API is enabled — see `isApiEnabled`.
 */
export class BuilderController extends Controller(getRoutePrefix()) {
  @Get(ROUTES.status)
  async status(@AuthTenantOwner() _user: User) {
    return { ok: true, projectRoot: resolveProjectRoot() };
  }

  @Get(ROUTES.catalog)
  async catalog(@AuthTenantOwner() _user: User) {
    return engine.GetCatalog();
  }

  @Get(ROUTES.pages)
  async pages(@AuthTenantOwner() _user: User) {
    return engine.ListPages();
  }

  @Get(ROUTES.categories)
  async categories(@AuthTenantOwner() _user: User) {
    return engine.ListCategories();
  }

  @Post(ROUTES.categories)
  async createCategory(
    @AuthTenantOwner() _user: User,
    @JSONBody() body: CreateCategoryInput,
  ) {
    return engine.CreateCategory(body);
  }

  @Put(ROUTES.category)
  async configureCategory(
    @AuthTenantOwner() _user: User,
    @JSONBody() body: ConfigureCategoryBody,
  ) {
    return engine.ConfigureCategory(body.category, body.patch);
  }

  @Delete(ROUTES.category)
  async deleteCategory(
    @AuthTenantOwner() _user: User,
    @Parameter("ref", "query") ref: string,
  ) {
    return engine.DeleteCategory(ref);
  }

  @Get(ROUTES.page)
  async pageStructure(
    @AuthTenantOwner() _user: User,
    @Parameter("ref", "query") ref: string,
  ) {
    return engine.GetPageStructure(ref);
  }

  @Post(ROUTES.pages)
  async createPage(
    @AuthTenantOwner() _user: User,
    @JSONBody() body: CreatePageInput,
  ) {
    return engine.CreatePage(body);
  }

  @Post(ROUTES.pageConfigure)
  async configurePage(
    @AuthTenantOwner() _user: User,
    @JSONBody() body: ConfigurePageBody,
  ) {
    return engine.ConfigurePage(
      body.page,
      body.patch,
      opts(body.expectedVersion),
    );
  }

  @Delete(ROUTES.page)
  async deletePage(
    @AuthTenantOwner() _user: User,
    @Parameter("ref", "query") ref: string,
  ) {
    return engine.DeletePage(ref);
  }

  @Post(ROUTES.preview)
  async preview(@AuthTenantOwner() _user: User, @JSONBody() body: PageBody) {
    return engine.PreviewLayout(body.page, body.draft);
  }

  @Post(ROUTES.blocks)
  async saveBlocks(@AuthTenantOwner() _user: User, @JSONBody() body: PageBody) {
    return engine.SetPageBlocks(
      body.page,
      body.draft,
      opts(body.expectedVersion),
    );
  }

  @Get(ROUTES.resources)
  async resources(@AuthTenantOwner() _user: User) {
    return engine.ListResources();
  }

  @Get(ROUTES.resource)
  async resource(
    @AuthTenantOwner() _user: User,
    @Parameter("ref", "query") ref: string,
  ) {
    return engine.GetResourceStructure(ref);
  }

  @Post(ROUTES.resources)
  async createResource(
    @AuthTenantOwner() _user: User,
    @JSONBody() body: CreateResourceInput,
  ) {
    return engine.CreateResource(body);
  }

  @Post(ROUTES.resourceConfigure)
  async configureResource(
    @AuthTenantOwner() _user: User,
    @JSONBody() body: ConfigureResourceBody,
  ) {
    return engine.ConfigureResource(
      body.resource,
      body.patch,
      opts(body.expectedVersion),
    );
  }

  @Post(ROUTES.fields)
  async addField(@AuthTenantOwner() _user: User, @JSONBody() body: FieldBody) {
    return engine.AddField(
      body.resource,
      body.field,
      opts(body.expectedVersion),
    );
  }

  @Put(ROUTES.fields)
  async configureField(
    @AuthTenantOwner() _user: User,
    @JSONBody() body: ConfigureFieldBody,
  ) {
    return engine.ConfigureField(
      body.path,
      body.patch,
      opts(body.expectedVersion),
    );
  }

  @Delete(ROUTES.fields)
  async removeField(
    @AuthTenantOwner() _user: User,
    @Parameter("path", "query") path: string,
  ) {
    return engine.RemoveField(path);
  }

  @Get(ROUTES.queryTemplates)
  async queryTemplates(@AuthTenantOwner() _user: User) {
    return engine.ListQueryTemplates();
  }

  @Post(ROUTES.queries)
  async addQuery(@AuthTenantOwner() _user: User, @JSONBody() body: QueryBody) {
    return engine.AddQuery(body.page, body.input, opts(body.expectedVersion));
  }

  @Put(ROUTES.queries)
  async configureQuery(
    @AuthTenantOwner() _user: User,
    @JSONBody() body: ConfigureQueryBody,
  ) {
    return engine.ConfigureQuery(
      body.query,
      body.patch,
      opts(body.expectedVersion),
    );
  }

  @Delete(ROUTES.queries)
  async removeQuery(
    @AuthTenantOwner() _user: User,
    @Parameter("ref", "query") ref: string,
  ) {
    return engine.RemoveQuery(ref);
  }

  @Post(ROUTES.refresh)
  async refresh(@AuthTenantOwner() _user: User) {
    await engine.RefreshSourceIndex();
    return { ok: true };
  }
}
