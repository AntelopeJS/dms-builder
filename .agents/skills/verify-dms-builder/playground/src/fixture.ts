import { randomUUID } from "node:crypto";
import { Controller, Get, JSONBody, Post } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel, UserInviteModel } from "@antelopejs/interface-dms/db";
import { GetPermissionId } from "@antelopejs/interface-dms/page";
import { Operations } from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { PageShopBoard } from "./board/page";

const INVITE_LIFETIME_MS = 3_600_000;

const operationNames = Object.keys(Operations);

/** JSON cannot carry `undefined`, which the operations read as "remove this key": `{ "$undefined": true }` stands for it. */
const reviveSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({ $undefined: z.literal(true) }).transform(() => undefined),
    z.array(reviveSchema),
    z.record(z.string(), reviveSchema),
    z.unknown(),
  ]),
);

const callSchema = z.object({
  name: z.string().refine((name) => operationNames.includes(name)),
  args: z.array(reviveSchema),
});

const memberSchema = z.object({
  name: z.string().default("Member"),
  permissions: z.array(z.string()).default([]),
});

/** The ids of the permissions a role holds, with every id its grants sit under, as the DMS roles editor stores them. */
function withAncestors(permissions: string[]): string[] {
  return [
    ...new Set(
      permissions.flatMap((id) => {
        const segments = id.split(".");
        return segments.map((_, index) =>
          segments.slice(0, index + 1).join("."),
        );
      }),
    ),
  ];
}

/**
 * Trusted backend calls a journey cannot make over HTTP: the builder's
 * interface operations as another module calls them in process, and members
 * with a role. Only the verification playground serves them.
 */
export class VerifyFixtureController extends Controller("/verify-builder") {
  /** `{ name, args }`: the operation `name` of `@antelopejs/interface-dms-builder`, called with the array `args` as its arguments. */
  @Post("/call")
  async call(@JSONBody() body: unknown) {
    const parsed = callSchema.safeParse(body);
    if (!parsed.success) {
      return { ok: false, error: { code: "fixture_unknown_operation" } };
    }
    const { name, args } = parsed.data;
    const entry = Object.entries(Operations).find(([key]) => key === name);
    if (!entry) {
      return { ok: false, error: { code: "fixture_unknown_operation" } };
    }
    const [, operation] = entry;
    try {
      const answer: unknown = await Function.prototype.apply.call(
        operation,
        undefined,
        args,
      );
      return { returned: answer ?? null };
    } catch (error) {
      return {
        threw: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** `{ name, permissions }`: a role holding the permissions, and an invitation to join with it. */
  @Post("/member")
  async member(@JSONBody() body: unknown) {
    const { name, permissions } = memberSchema.parse(body);
    const [roleId] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
      name: `${name} ${randomUUID()}`,
      permissions: withAncestors(permissions),
    });
    const token = randomUUID();
    const email = `${name.toLowerCase()}-${randomUUID()}@verify.local`;
    await GetModel(UserInviteModel, DEFAULT_TENANT_ID).insert({
      email,
      roles_ids: roleId === undefined ? [] : [roleId],
      language: "en",
      token,
      asTenantOwner: false,
      expiresAt: new Date(Date.now() + INVITE_LIFETIME_MS),
    });
    return { email, token, roleId };
  }

  /** The permission ids the DMS registered for the Board page and its blocks. */
  @Get("/permissions")
  permissions() {
    return {
      board: GetPermissionId(PageShopBoard),
      chartCard: GetPermissionId(PageShopBoard.chartCard),
      revenueChart: GetPermissionId(PageShopBoard.revenueChart),
      tableView: GetPermissionId(PageShopBoard.tableView),
    };
  }
}
