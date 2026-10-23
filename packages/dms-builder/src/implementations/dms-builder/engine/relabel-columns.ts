import {
  Node,
  type ObjectLiteralExpression,
  type Project,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import type { MappingPlan } from "./map-resources-plan";
import type { ResourceRecord } from "./resource-index";
import type { Transaction } from "./writable";

const RELATION_TYPE = "RelationType";

function relationConfigs(file: SourceFile): ObjectLiteralExpression[] {
  return file.getDescendantsOfKind(SyntaxKind.NewExpression).flatMap((call) => {
    const config = call.getArguments()[0];
    return call.getExpression().getText().endsWith(RELATION_TYPE) &&
      Node.isObjectLiteralExpression(config)
      ? [config]
      : [];
  });
}

/** Sets the label of the relation columns in `file` that point at `apiName`. */
function relabelColumns(
  file: SourceFile,
  apiName: string,
  label: string,
): void {
  for (const config of relationConfigs(file)) {
    const controller = config.getProperty("dataApiController");
    const keyMapping = config.getProperty("keyMapping");
    if (
      !Node.isPropertyAssignment(controller) ||
      controller.getInitializer()?.getText() !== apiName ||
      !Node.isPropertyAssignment(keyMapping)
    ) {
      continue;
    }
    const mapping = keyMapping.getInitializer();
    const current = Node.isObjectLiteralExpression(mapping)
      ? mapping.getProperty("label")
      : undefined;
    if (
      Node.isPropertyAssignment(current) &&
      current.getInitializer()?.getText() !== JSON.stringify(label)
    ) {
      current.setInitializer(JSON.stringify(label));
    }
  }
}

/**
 * The module's other mapped relations show the batch's relations by their label: a column
 * pointing at one follows its new label, so it does not keep showing the old one.
 */
export function relabelPointingColumns(
  project: Project,
  transaction: Transaction,
  records: Map<string, ResourceRecord>,
  plan: MappingPlan,
): void {
  const batch = new Set(plan.resources.map((resource) => resource.relation));
  const labelled = plan.resources.filter((resource) => resource.label);
  for (const [relation, record] of records) {
    if (batch.has(relation) || labelled.length === 0) {
      continue;
    }
    const file = project.getSourceFile(record.dataApiFile);
    if (!file) {
      continue;
    }
    transaction.track(file);
    for (const resource of labelled) {
      relabelColumns(file, resource.names.apiName, resource.label!);
    }
  }
}
