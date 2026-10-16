import {
  Controller,
  Get,
  HTTPResult,
  JSONBody,
  Parameter,
  Post,
  Put,
} from "@antelopejs/interface-api";
import type { SampleRequest } from "@antelopejs/interface-database-catalog";
import { AuthTenantOwner } from "@antelopejs/interface-dms/guards";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type {
  AnalyseDatabaseInput,
  MapResourcesInput,
  ProjectConfigOpts,
  ProjectConfigStep,
} from "@antelopejs/interface-dms-builder";
import { DEFAULT_ROUTE_PREFIX, ROUTES } from "../constants/routes";
import * as engine from "../implementations/dms-builder";
import {
  catalogOf,
  listCatalogConnections,
} from "../implementations/dms-builder/engine/catalog-connection";
import {
  EnvRefusal,
  setProjectVariable,
} from "../implementations/dms-builder/engine/project-env";

const HTTP_NOT_FOUND = 404;
const HTTP_REFUSED = 422;

interface SampleBody extends SampleRequest {
  connection: string;
}

interface ProjectBody {
  steps: ProjectConfigStep[];
  opts?: ProjectConfigOpts;
}

interface VariableBody {
  name: string;
  value: string;
}

/** One of the builder's catalog connections, with what its provider answers about it. */
interface ConnectionEntry {
  id: string;
  engine?: string;
  version?: string;
  database?: string;
  role?: string;
  error?: string;
}

async function connectionEntry(id: string): Promise<ConnectionEntry> {
  try {
    const info = await catalogOf(id)!.Info();
    return { id, ...info };
  } catch (error) {
    return { id, error: (error as Error).message };
  }
}

function refused(error: unknown): HTTPResult {
  return new HTTPResult(HTTP_REFUSED, {
    code: "refused",
    message: (error as Error).message,
  });
}

/**
 * The routes of the builder's *Database* workspace: its catalog connections, the analysis, the
 * mapping, the project wiring, and the sample of rows. Rows answer the project's owner here and
 * nowhere else: no interface function of the builder passes them on.
 */
export class DatabaseController extends Controller(DEFAULT_ROUTE_PREFIX) {
  @Get(ROUTES.databaseConnections)
  async connections(@AuthTenantOwner() _user: User) {
    const entries: ConnectionEntry[] = [];
    for (const id of listCatalogConnections()) {
      entries.push(await connectionEntry(id));
    }
    return entries;
  }

  @Post(ROUTES.databaseAnalyse)
  async analyse(
    @AuthTenantOwner() _user: User,
    @JSONBody() body: AnalyseDatabaseInput,
  ) {
    return engine.AnalyseDatabase(body);
  }

  @Get(ROUTES.databaseAnalysis)
  async analysis(
    @AuthTenantOwner() _user: User,
    @Parameter("id", "query") id: string,
  ) {
    return engine.GetAnalysis(id);
  }

  @Post(ROUTES.databaseMap)
  async map(
    @AuthTenantOwner() _user: User,
    @JSONBody() body: MapResourcesInput,
  ) {
    return engine.MapResources(body);
  }

  @Post(ROUTES.databaseProject)
  async project(@AuthTenantOwner() _user: User, @JSONBody() body: ProjectBody) {
    return engine.ConfigureProject(body.steps, body.opts);
  }

  @Put(ROUTES.databaseVariable)
  async variable(
    @AuthTenantOwner() _user: User,
    @JSONBody() body: VariableBody,
  ) {
    try {
      setProjectVariable(body.name, body.value);
      return { ok: true, name: body.name };
    } catch (error) {
      if (error instanceof EnvRefusal) {
        return refused(error);
      }
      throw error;
    }
  }

  @Post(ROUTES.databaseSample)
  async sample(@AuthTenantOwner() _user: User, @JSONBody() body: SampleBody) {
    const catalog = catalogOf(body.connection);
    if (!catalog) {
      return new HTTPResult(HTTP_NOT_FOUND, {
        code: "not_found",
        ref: body.connection,
      });
    }
    try {
      return await catalog.SampleRows({
        relation: body.relation,
        columns: body.columns,
        limit: body.limit,
      });
    } catch (error) {
      return refused(error);
    }
  }
}
