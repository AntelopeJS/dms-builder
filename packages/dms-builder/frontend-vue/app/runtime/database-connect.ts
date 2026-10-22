/**
 * What the *Connect a database* form asks for, and the `ConfigureProject` batch it
 * turns into. The integrator names the connection and gives its connection details;
 * the modules and the variable the builder manages are named after it.
 */
import type { ModuleEntryInput, ProjectConfigStep } from './database-types'

const CATALOG_INTERFACE = '@antelopejs/interface-database-catalog'
const DATABASE_INTERFACE = '@antelopejs/interface-database'
const STATEMENT_TIMEOUT_MS = 30000
/**
 * Below the default of 0, so a module that does not pin `interface-database` keeps the
 * project's own database, and the rest of the configuration is left as it is.
 */
const DRIVER_EXPORT_PRIORITY = -1
const MANAGED_PREFIX = 'builder-db'
const MODULES_DIRECTORY = 'modules'
const DMS_BUILDER = 'dms-builder'
const DMS_AI = 'dms-ai'
const SSL_PARAMETER = 'sslmode'
const SSL_DEFAULT_MODE = 'require'
/** The `sslmode` values that encrypt; a pasted strict one is kept as it is. */
const SSL_MODES = new Set(['require', 'verify-ca', 'verify-full'])
const STRICT_SSL_MODES = new Set(['verify-ca', 'verify-full'])

export type DatabaseEngine = 'postgres'

/** How to reach a database, field by field. `options` holds the URL parameters no field covers. */
export interface ConnectionFields {
	host: string
	port: string
	database: string
	user: string
	password: string
	ssl: boolean
	options: Record<string, string>
}

interface EngineSpec {
	label: string
	package: string
	version: string
	port: string
	schemes: string[]
}

export const ENGINES: Record<DatabaseEngine, EngineSpec> = {
	postgres: {
		label: 'PostgreSQL',
		package: '@antelopejs/postgres',
		version: '>=0.2.1 <1.0.0',
		port: '5432',
		schemes: ['postgres:', 'postgresql:'],
	},
}

/** The names the builder manages for a connection, under *Advanced settings*. */
export interface ManagedNames {
	driverModule: string
	tablesModule: string
	variable: string
	version: string
}

export interface ConnectForm {
	name: string
	engine: DatabaseEngine
	fields: ConnectionFields
	/** The managed names the integrator changed; the others follow the name. */
	overrides: Partial<ManagedNames>
}

export function emptyFields(engine: DatabaseEngine): ConnectionFields {
	return {
		host: '',
		port: ENGINES[engine].port,
		database: '',
		user: '',
		password: '',
		ssl: false,
		options: {},
	}
}

/** The connection's id: the name in lower case, words joined by dashes. */
export function connectionId(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

export function defaultNames(name: string, engine: DatabaseEngine): ManagedNames {
	const id = connectionId(name)
	return {
		driverModule: `${MANAGED_PREFIX}-${id}`,
		tablesModule: `${MANAGED_PREFIX}-${id}-tables`,
		variable: `${MANAGED_PREFIX}-${id}-url`.toUpperCase().replace(/-/g, '_'),
		version: ENGINES[engine].version,
	}
}

export function managedNames(form: ConnectForm): ManagedNames {
	return { ...defaultNames(form.name, form.engine), ...form.overrides }
}

/** Whether the URL names a database of this engine, by its scheme. */
export function isConnectionUrl(engine: DatabaseEngine, text: string): boolean {
	return ENGINES[engine].schemes.some((scheme) => text.trim().startsWith(`${scheme}//`))
}

function sslFromMode(mode: string | undefined): Pick<ConnectionFields, 'ssl' | 'options'> {
	if (mode === undefined || !SSL_MODES.has(mode)) {
		return { ssl: false, options: {} }
	}
	return { ssl: true, options: STRICT_SSL_MODES.has(mode) ? { [SSL_PARAMETER]: mode } : {} }
}

/** The fields a pasted URL holds. Throws when it is not a URL of this engine. */
export function parseConnectionUrl(engine: DatabaseEngine, text: string): ConnectionFields {
	const url = new URL(text.trim())
	if (!ENGINES[engine].schemes.includes(url.protocol)) {
		throw new Error(`not a ${ENGINES[engine].label} URL`)
	}
	const parameters = Object.fromEntries(url.searchParams)
	const { [SSL_PARAMETER]: mode, ...others } = parameters
	const ssl = sslFromMode(mode)
	return {
		host: decodeURIComponent(url.hostname),
		port: url.port || ENGINES[engine].port,
		database: decodeURIComponent(url.pathname.replace(/^\//, '')),
		user: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password),
		ssl: ssl.ssl,
		options: { ...others, ...ssl.options },
	}
}

function credentials(fields: ConnectionFields): string {
	if (!fields.user) {
		return ''
	}
	const password = fields.password ? `:${encodeURIComponent(fields.password)}` : ''
	return `${encodeURIComponent(fields.user)}${password}@`
}

function parameters(fields: ConnectionFields): string {
	const { [SSL_PARAMETER]: mode, ...others } = fields.options
	const all = fields.ssl ? { ...others, [SSL_PARAMETER]: mode ?? SSL_DEFAULT_MODE } : others
	const query = new URLSearchParams(all).toString()
	return query ? `?${query}` : ''
}

/** The URL the fields describe, the value written into `.env`. */
export function connectionUrl(engine: DatabaseEngine, fields: ConnectionFields): string {
	const scheme = ENGINES[engine].schemes[0]
	const port = fields.port ? `:${fields.port}` : ''
	const database = encodeURIComponent(fields.database)
	return `${scheme}//${credentials(fields)}${fields.host}${port}/${database}${parameters(fields)}`
}

/** What still keeps the form from showing its changes, if anything. */
export function missingField(form: ConnectForm): string | undefined {
	const names = managedNames(form)
	const required: [string, string][] = [
		['a name', connectionId(form.name)],
		['a host', form.fields.host],
		['a database', form.fields.database],
		['a user', form.fields.user],
		['a driver module', names.driverModule],
		['a tables module', names.tablesModule],
		['a variable', names.variable],
		['a package version', names.version],
	]
	return required.find(([, value]) => value.trim() === '')?.[0]
}

function catalogConnection(id: string, driverModule: string): ModuleEntryInput {
	return {
		importOverrides: [{ interface: CATALOG_INTERFACE, source: driverModule, id }],
	}
}

/**
 * The `ConfigureProject` batch that wires the database into the project: its driver, the module
 * for its tables, and a catalog connection for the builder and, when the project has it, dms-ai.
 */
export function connectSteps(form: ConnectForm, projectModules: string[]): ProjectConfigStep[] {
	const id = connectionId(form.name)
	const names = managedNames(form)
	const steps: ProjectConfigStep[] = [
		{
			op: 'AddModule',
			id: names.driverModule,
			entry: {
				source: { type: 'package', package: ENGINES[form.engine].package, version: names.version },
				config: { mode: 'external', statementTimeoutMs: STATEMENT_TIMEOUT_MS },
				env: { url: names.variable },
				exportPriority: { [DATABASE_INTERFACE]: DRIVER_EXPORT_PRIORITY },
			},
		},
		{
			op: 'CreateLocalModule',
			id: names.tablesModule,
			path: `${MODULES_DIRECTORY}/${names.tablesModule}`,
			entry: {
				importOverrides: [{ interface: DATABASE_INTERFACE, source: names.driverModule }],
			},
		},
		{ op: 'ConfigureModule', id: DMS_BUILDER, entry: catalogConnection(id, names.driverModule) },
	]
	if (projectModules.includes(DMS_AI)) {
		steps.push({ op: 'ConfigureModule', id: DMS_AI, entry: catalogConnection(id, names.driverModule) })
	}
	return steps
}
