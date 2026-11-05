# Coverage: queries

Docs: `6.queries.md`, `9.drafts-and-preview.md`, `10.a-chart-without-code.md`. Journeys: `journeys/queries.mjs`.

| Source | Documented behaviour | Journey | Check / Not driven |
| --- | --- | --- | --- |
| interface-dms-builder/docs/6.queries.md:44 | ListQueryTemplates lists count, aggregate and series with their output | preview-query-answers-exact-figures-from-the-seeded-orders | ids and scalar/series |
| interface-dms-builder/docs/6.queries.md:118 | the six filter operations combine with AND | same | eq 12, ne 6, gt 6, ge 6, lt 2, le 3, combined 6 on the 18 seeded orders |
| interface-dms-builder/docs/6.queries.md:199 | aggregate sum, max, min, avg; series count by group, ordering and top N | same | 2620/3055, 420, 45, 86.67; paid=12,pending=3,refunded=3; top 2 |
| interface-dms-builder/docs/6.queries.md:199 | bucket only on a date field; field required except count; unknown field or type | same | invalid_config for four cases; one year bucket sums to 18 |
| interface-dms-builder/docs/6.queries.md:147 | a bound value is a parameter; PreviewQuery needs its argument | same | unsupported without; 7 with max 100 |
| interface-dms-builder/docs/9.drafts-and-preview.md:216 | PreviewQuery answers every failure as an OpResult | same | not_found for an unknown resource |
| interface-dms-builder/docs/9.drafts-and-preview.md:216 | PreviewQuery validates parameters as AddQuery does | preview-validates-parameters-as-add-query-does | FAILS: dms-builder#150 |
| interface-dms-builder/docs/6.queries.md:79 | AddQuery writes route and model method and answers query and route | add-configure-and-remove-a-query-write-a-route-and-a-model-method | /shop/lab@paidCount; /dms/pages/shop/lab/stats/paid-count; route with the page permission; method in database.ts |
| interface-dms-builder/docs/6.queries.md:315 | GetPageStructure reads the query back; ConfigureQuery recompiles | same | template, resource, endpoint, output, params; filter becomes pending |
| interface-dms-builder/docs/6.queries.md:79 | name, endpoint, expression and path-parameter rules | same | duplicate_name scope query; invalid_config x4; duplicate endpoint; not_found |
| interface-dms-builder/docs/6.queries.md:147 | a bound value is a declared route parameter | same | Parameter decorator and Number() |
| interface-dms-builder/docs/6.queries.md:305 | RemoveQuery removes route and model method | same | both gone; again not_found |
| interface-dms-builder/docs/6.queries.md:247 | response arrangements and compare | - | Not driven: the helpers are exercised only through the Board chart (editor); the card/value/items bodies are not asserted |
| interface-dms-builder/docs/6.queries.md:289 | opaque queries and hand-written routes | - | Not driven: the playground has no hand-edited query |
