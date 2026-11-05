# Coverage: database

Docs: `11.external-databases.md`. Journeys: `journeys/database.mjs`.

| Source | Documented behaviour | Journey | Check / Not driven |
| --- | --- | --- | --- |
| interface-dms-builder/docs/11.external-databases.md:18 | GET /database/connections lists catalog connections | a-project-without-an-external-database-answers-the-documented-empties-and-404s | empty list |
| dms-builder/docs/5.extending.md:84 | unknown connection, analysis, sample answer 404 | same | 404 for each |
| dms-builder/docs/5.extending.md:84 | /database/project answers modules | same | a non-empty modules list |
| interface-dms-builder/docs/11.external-databases.md:89 | removing and re-pointing a connection | same | refused for an unknown connection; Not driven: a real connection |
| interface-dms-builder/docs/11.external-databases.md:99 | AnalyseDatabase, GetAnalysis, proposals, MapResources and their warnings | - | Not driven: needs an external database and a catalog provider (a SQL engine in Docker plus its module), which this run does not start |
| dms-builder/docs/4.usage/1.page-editor.md:18 | the Database workspace | the-database-workspace-offers-to-connect-a-database | it opens and speaks of connecting |
| dms-builder/frontend-vue/app/components/ConnectPrompt.vue (no docs page) | a browser that never answered is asked to connect a database on its first dashboard page; Not now is remembered; Connect a database opens the connect form | the-connect-prompt-asks-once-per-browser | the dialog and its two buttons; hidden after Not now and a reload; the connect form's intro; Not driven: a project with an external connection, which never shows it |
