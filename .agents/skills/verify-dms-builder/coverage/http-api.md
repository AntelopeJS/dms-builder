# Coverage: http-api

Docs: `3.configuration.md`, `5.extending.md`, `6.faq.md`. Journeys: `journeys/http-api.mjs`.

| Source | Documented behaviour | Journey | Check / Not driven |
| --- | --- | --- | --- |
| dms-builder/docs/3.configuration.md:10 | projectRoot is the app source root; a relative one resolves against the working directory | project-root-decides-where-the-builder-writes | status reports the run playground by default; a relative root is reported absolute and not the literal dot |
| dms-builder/docs/3.configuration.md:11 | api.enabled forces the builder on or off | the-builder-follows-api-enabled-and-the-start-mode | forced on: /status 200; unset under start: /status and /pages 404; false: 404 |
| dms-builder/docs/3.configuration.md:26 | ajs project start leaves the builder off: no routes, no button | the-builder-follows-api-enabled-and-the-start-mode | routes 404 driven; Not driven: the dashboard is built once and keeps its button |
| dms-builder/docs/3.configuration.md:15 | The module does not read a factoring option | - | Not driven: absence of a read cannot be observed |
| dms-builder/docs/5.extending.md:20 | Every route requires an authenticated tenant owner | every-route-needs-a-tenant-owner | anonymous and a member get 401 or 403 on seven routes; a member cannot create a page |
| dms-builder/docs/5.extending.md:22 | List reads answer their value; mutations answer an OpResult to branch on ok | lists-answer-their-value-and-mutations-answer-an-op-result | catalog, pages, categories, resources, query-templates, data-sources, tables/usage, permissions; refused POSTs answer ok false with the code |
| dms-builder/docs/5.extending.md:22 | /page/impact and /page/access answer 404 with code not_found and ref | lists-answer-their-value-and-mutations-answer-an-op-result | 404, code and ref for both |
| dms-builder/docs/5.extending.md:56 | POST /refresh answers { ok: true } | lists-answer-their-value-and-mutations-answer-an-op-result | status 200 and ok true |
| dms-builder/docs/5.extending.md:56 | Null in a /page/configure or /category patch removes the option | pages / configure-a-page-patches-and-moves-it | icon: null removes the icon (through ConfigurePage) |
| dms-builder/docs/5.extending.md:60 | GET /query-preview answers the bare body, with 400, 404 and 422 for failures | - | Not driven: the query is JSON in the URL; PreviewQuery is driven through the operation instead (queries) |
| dms-builder/docs/5.extending.md:84 | A refused database request answers 422 with code refused | database | refusals driven on unknown connections; the exact 422 body needs a real connection |
| dms-builder/docs/5.extending.md:117 | Frontend module registered at priority 100 only when the builder is on; English fallback; locale files | - | Not driven: the registration is read by the dashboard build; i18n catalogs are driven in i18n |
| dms-builder/docs/6.faq.md:5 | The hammer button is missing under ajs project start | the-builder-follows-api-enabled-and-the-start-mode | Not driven: see above |
| dms-builder/docs/6.faq.md:12 | Every /api/builder route answers 404 when the builder is off | the-builder-follows-api-enabled-and-the-start-mode | /status and /pages answer 404 |
