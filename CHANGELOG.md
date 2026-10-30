# Changelog

## Unreleased

### Upgrade notes

- A tables module scaffolded by *Connect* now depends on `@antelopejs/interface-dms` `>=0.9.2 <1.0.0`, the release whose relation fields no longer recurse on a self-referencing foreign key (`employees.manager_id → employees`). A tables module scaffolded by an earlier release keeps `>=0.9.0`: raise that range in its `package.json` by hand, then reinstall it, before mapping a table that references itself. Where the project's own `package.json` declares `@antelopejs/interface-dms`, the scaffold takes the project's range instead.
- `MapResources` now waits, up to 60 s, for the tables module it wrote into to reload, and answers the warning `module_not_loaded` when the module did not come back. A project that does not reload a module whose files change answers after the full wait.
