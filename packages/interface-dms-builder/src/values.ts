/**
 * Config values (`AddBlockInput.config`, `ConfigureBlock` patches) are plain
 * JSON by default. Two sentinel object shapes emit non-literal TypeScript:
 * {@link DataTypeValue} for a DataType instance and {@link ExprValue} for a raw
 * expression. Anywhere a catalog field is marked `x-dataType`, pass a
 * {@link DataTypeValue} — not a raw `$expr`.
 */

/**
 * A DataType value for a Form field's `type` (or a TableView `Column` `type`).
 * Emitted as `new <DataType>(<config>)` with the import auto-added.
 *
 * ```ts
 * { $dataType: "string", config: { placeholder: "Name" } }
 * // → type: new DefaultDataTypes.StringType({ placeholder: "Name" })
 * ```
 */
export interface DataTypeValue {
  /** A `DataTypeDescriptor.id` from the catalog, e.g. `"string"` | `"select"`. */
  $dataType: string;
  /** The DataType's options; omit for a no-arg `new <DataType>()`. */
  config?: Record<string, unknown>;
}

/**
 * A raw TypeScript expression, emitted verbatim. Required for values the builder
 * cannot model structurally. The referenced symbol must already be importable in
 * the target file; the builder does not add its import.
 *
 * Note: dms-ai's safe mode rejects `$expr` (arbitrary code defeats the
 * structured guarantees). Only a direct file edit (vibe mode) should use it.
 */
export interface ExprValue {
  $expr: string;
}

/**
 * A reference to a builder-generated resource class, emitted as the bare class
 * identifier with its import auto-added. The structured, validated alternative to
 * `$expr` for a class reference — e.g. a `RelationType`'s `dataApiController`.
 *
 * ```ts
 * { $ref: { resource: "product" } }
 * // → productDataAPI   (imported from the resource's data-api.ts)
 * ```
 *
 * `as` selects which of the resource's classes: `"dataApi"` (default, the
 * `DataController`), `"table"` (the `Table`), or `"model"` (the `BasicDataModel`).
 * The resource must exist (unknown → `invalid_config`). Unlike `$expr`, this is
 * **allowed in safe mode**.
 */
export interface RefValue {
  $ref: {
    /** A `ResourceRef` — the resource's name, e.g. `"product"`. */
    resource: string;
    /** Which class to reference; defaults to `"dataApi"`. */
    as?: "dataApi" | "table" | "model";
  };
}

/**
 * A nested block, for the rare option that holds a component rather than data —
 * a ChartCard's `chart`, which the catalog marks `x-component`. Emitted as the
 * factory call with its import auto-added, and read back as this same shape.
 *
 * ```ts
 * { $block: { type: "ChartArea", config: { xaxisType: "datetime" } } }
 * // → chart: ChartArea({ xaxisType: "datetime" })
 * ```
 *
 * Allowed in safe mode: the type is checked against the catalog and the config
 * is serialized the same way any other config is.
 */
export interface BlockValue {
  $block: {
    /** A `BlockTypeDescriptor.type` from the catalog. */
    type: string;
    config?: Record<string, unknown>;
  };
}
