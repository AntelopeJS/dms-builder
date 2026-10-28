/**
 * What the *Connect a database* form asks for, and the `ConfigureProject` batch it
 * turns into. The integrator names the connection and gives its connection details;
 * the modules and the variable the builder manages are named after it.
 */
import type {
	ConnectionDetails,
	ModuleEntryInput,
	ProjectConfigStep,
	ProjectModules,
} from './database-types'

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
/** The `sslmode` values the SSL switch stands for; a strict one, or any other, is kept as it is. */
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

/** The connection's id: the name in lower case without accents, words joined by dashes. */
export function connectionId(name: string): string {
	return name
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
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
	if (mode === undefined) {
		return { ssl: false, options: {} }
	}
	if (!SSL_MODES.has(mode)) {
		return { ssl: false, options: { [SSL_PARAMETER]: mode } }
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
		database: decodeURI(url.pathname.replace(/^\//, '')),
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
	const kept = mode !== undefined && SSL_MODES.has(mode) === fields.ssl ? mode : undefined
	const sslMode = fields.ssl ? (kept ?? SSL_DEFAULT_MODE) : kept
	const all = sslMode === undefined ? others : { ...others, [SSL_PARAMETER]: sslMode }
	const query = new URLSearchParams(all).toString()
	return query ? `?${query}` : ''
}

const SOCKET_DIRECTORY = /^\//
const IPV6 = /^[0-9a-f.]*:[0-9a-f.]*:[0-9a-f:.]*$/i
const BRACKETED_IPV6 = /^\[[0-9a-f:.]+\]$/i
const HOST_NAME = /^[A-Za-z0-9._~-]+$/
const PORT = /^\d{1,5}$/
/** The characters a database name cannot hold: the driver reads the name with `decodeURI`, which keeps them encoded. */
const UNWRITABLE_DATABASE = /[?#]/

/** The host as the driver reads it: a socket directory encoded whole, an IPv6 address in brackets. */
function hostText(host: string): string {
	const trimmed = host.trim()
	if (SOCKET_DIRECTORY.test(trimmed)) {
		return encodeURIComponent(trimmed)
	}
	return IPV6.test(trimmed) ? `[${trimmed}]` : trimmed
}

/** What keeps the fields from making a URL the driver reads as they say, if anything. */
export function fieldProblem(fields: ConnectionFields): string | undefined {
	const host = fields.host.trim()
	const written = [SOCKET_DIRECTORY, IPV6, BRACKETED_IPV6, HOST_NAME].some((pattern) => pattern.test(host))
	if (host && !written) {
		return 'the host is a name or an address only: no spaces, port or path'
	}
	if (fields.port.trim() && !PORT.test(fields.port.trim())) {
		return 'the port is a number'
	}
	if (UNWRITABLE_DATABASE.test(fields.database)) {
		return 'the database name cannot hold ? or #'
	}
	return undefined
}

/** The URL the fields describe, the value written into `.env`, with the engine's first scheme unless given one. */
export function connectionUrl(
	engine: DatabaseEngine,
	fields: ConnectionFields,
	scheme: string = ENGINES[engine].schemes[0],
): string {
	const port = fields.port.trim() ? `:${fields.port.trim()}` : ''
	const database = encodeURI(fields.database)
	return `${scheme}//${credentials(fields)}${hostText(fields.host)}${port}/${database}${parameters(fields)}`
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

function tablesStep(id: string, names: ManagedNames): ProjectConfigStep {
	return {
		op: 'CreateLocalModule',
		id: names.tablesModule,
		path: `${MODULES_DIRECTORY}/${names.tablesModule}`,
		entry: { importOverrides: [{ interface: DATABASE_INTERFACE, source: names.driverModule }] },
		connection: id,
	}
}

/** Whether the fields still reach the server and user the saved password belongs to. */
export function keepsServer(saved: ConnectionFields, fields: ConnectionFields): boolean {
	return saved.host === fields.host && saved.port === fields.port && saved.user === fields.user
}

/** The fields a connection's saved details fill, the password left empty and a port left out kept out. */
export function detailsFields(details: ConnectionDetails): ConnectionFields {
	const { [SSL_PARAMETER]: mode, ...others } = details.options
	const ssl = sslFromMode(mode)
	return {
		host: details.host,
		port: details.port,
		database: details.database,
		user: details.user,
		password: '',
		ssl: ssl.ssl,
		options: { ...others, ...ssl.options },
	}
}

/**
 * The `ConfigureProject` batch that wires the database into the project: its driver, the module
 * for its tables, a catalog connection for the builder and, when the project has it, dms-ai, and
 * the DMS module's pin to the project's own database when it needs one.
 */
export function connectSteps(form: ConnectForm, project: ProjectModules): ProjectConfigStep[] {
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
		tablesStep(id, names),
		{ op: 'ConfigureModule', id: DMS_BUILDER, entry: catalogConnection(id, names.driverModule) },
	]
	if (project.modules.includes(DMS_AI)) {
		steps.push({ op: 'ConfigureModule', id: DMS_AI, entry: catalogConnection(id, names.driverModule) })
	}
	if (project.databasePin) {
		const { module, provider } = project.databasePin
		steps.push({
			op: 'ConfigureModule',
			id: module,
			entry: { importOverrides: [{ interface: DATABASE_INTERFACE, source: provider }] },
		})
	}
	return steps
}

interface Refusal {
	code?: string
	detail?: string
	ref?: string
	issues?: { message: string }[]
	diagnostics?: { file: string; line: number; message: string }[]
	blockedBy?: string[]
}

function fileName(file: string): string {
	return file.split(/[\\/]/).slice(-3).join('/')
}

/** What a refused change says, in the module's own words. */
export function refusalText(error: unknown): string {
	const refusal = (error ?? {}) as Refusal
	if (refusal.issues) {
		return refusal.issues.map((issue) => issue.message).join('; ')
	}
	if (refusal.diagnostics) {
		const found = refusal.diagnostics.map((item) => `${fileName(item.file)}:${item.line} ${item.message}`)
		return `The project does not typecheck: ${found.join('; ')}`
	}
	if (refusal.detail) {
		return refusal.detail
	}
	if (refusal.code === 'not_found' && refusal.ref) {
		return `${refusal.ref} was not found`
	}
	if (refusal.blockedBy) {
		return `Still used by ${refusal.blockedBy.join(', ')}`
	}
	return JSON.stringify(error)
}
