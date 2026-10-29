/**
 * The build screen's state, derived from what the server answers and never stored: whether the
 * configuration declares the connection, whether the builder lists it and with what, and the
 * connection's latest analysis. A closed tab or a reload of the project resumes where things stand.
 */
import type { useBuilderApi } from './api'
import type { AnalysisState, DatabaseConnection, MappingProposal, OpenItem } from './database-types'

/** How long the screen waits for the project to come back before it says how to restart by hand. */
export const RELOAD_LIMIT_MS = 3 * 60 * 1000

export type StepStatus = 'pending' | 'running' | 'done' | 'failed'

export type StepKey = 'add' | 'reload' | 'connect' | 'read'

export interface BuildStep {
	key: StepKey
	title: string
	status: StepStatus
	detail: string
}

/** What could not be read because the project was down: it counts as reloading. */
export const UNREACHABLE = 'unreachable'

type Unreachable = typeof UNREACHABLE

/** The three answers the screen derives from, each one possibly lost to a reload. */
export interface BuildAnswers {
	/** Whether the configuration declares the connection (`GET /database/connection`). */
	declared: boolean | Unreachable
	/** The variable holding its URL, when the configuration declares it. */
	variable?: string
	/** The builder's entry for the connection (`GET /database/connections`), or null when not listed. */
	listed: DatabaseConnection | null | Unreachable
	/** The connection's latest analysis (`GET /database/analysis?connection=`), or null when none. */
	analysis: AnalysisState | null | Unreachable
}

/** What the fork says of a proposal: "8 tables: 5 pages, 2 for statistics, 3 questions". */
export interface ForkSummary {
	tables: number
	pages: number
	stats: number
	questions: number
}

export interface BuildView {
	steps: BuildStep[]
	/** The project is reloading: a request failed, or the connection is declared but not listed yet. */
	reloading: boolean
	/** The reload took longer than {@link RELOAD_LIMIT_MS}. */
	gaveUp: boolean
	/** The connection is listed with an error: step 3 failed with it. */
	connectionError?: string
	/** The analysis asks which schemas to read before anything else. */
	schemas?: OpenItem
	/** Connected and not analysed: the screen starts the analysis. */
	needsAnalysis: boolean
	/** The analysis read nothing mappable. */
	empty: boolean
	/** The analysis job the fork and *Review it myself* stand on. */
	job?: string
	fork?: ForkSummary
}

interface FetchFailure {
	data?: { code?: string }
}

function isNotFound(error: unknown): boolean {
	return (error as FetchFailure | undefined)?.data?.code === 'not_found'
}

async function readDeclared(
	api: ReturnType<typeof useBuilderApi>,
	connection: string,
): Promise<Pick<BuildAnswers, 'declared' | 'variable'>> {
	try {
		const info = await api.databaseConnection(connection)
		return { declared: true, variable: info.wiring.variable }
	} catch (error) {
		return { declared: isNotFound(error) ? false : UNREACHABLE }
	}
}

async function readListed(
	api: ReturnType<typeof useBuilderApi>,
	connection: string,
): Promise<DatabaseConnection | null | Unreachable> {
	try {
		const entries = await api.databaseConnections()
		return entries.find((entry) => entry.id === connection) ?? null
	} catch {
		return UNREACHABLE
	}
}

async function readAnalysis(
	api: ReturnType<typeof useBuilderApi>,
	connection: string,
): Promise<AnalysisState | null | Unreachable> {
	try {
		const latest = await api.latestAnalysis(connection)
		return latest.ok ? latest.data : null
	} catch (error) {
		return isNotFound(error) ? null : UNREACHABLE
	}
}

/** Reads the three answers the screen derives from. A request that failed counts as reloading. */
export async function readBuild(api: ReturnType<typeof useBuilderApi>, connection: string): Promise<BuildAnswers> {
	const [wiring, listed, analysis] = await Promise.all([
		readDeclared(api, connection),
		readListed(api, connection),
		readAnalysis(api, connection),
	])
	return { ...wiring, listed, analysis }
}

/** The questions a purpose item carries count beside it, as the workspace asks them. */
export function forkSummary(proposal: MappingProposal): ForkSummary {
	const asked = proposal.open.filter((item) => item.kind !== 'schemas')
	const purposes = asked.filter((item) => item.kind === 'purpose' && item.resource)
	return {
		tables: proposal.resources.length + purposes.length,
		pages: proposal.resources.filter((resource) => resource.tableView.value).length,
		stats: proposal.resources.filter((resource) => !resource.tableView.value).length,
		questions: asked.length + purposes.reduce((count, item) => count + (item.open?.length ?? 0), 0),
	}
}

function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`
}

/** "8 tables: 5 pages, 2 for statistics, 3 questions". */
export function forkText(summary: ForkSummary): string {
	return `${plural(summary.tables, 'table', 'tables')}: ${plural(summary.pages, 'page', 'pages')}, ${summary.stats} for statistics, ${plural(summary.questions, 'question', 'questions')}`
}

function step(key: StepKey, title: string, status: StepStatus, detail = ''): BuildStep {
	return { key, title, status, detail }
}

function addStep(answers: BuildAnswers): BuildStep {
	const title = 'Adding the connection to the project'
	if (answers.declared === false) {
		return step('add', title, 'failed', 'The configuration does not declare this connection.')
	}
	const where = answers.variable
		? ` as ${answers.variable}. Every deployed environment sets it where it keeps its secrets, never in git`
		: ''
	return step('add', title, 'done', `Written into the configuration, the URL into .env${where}.`)
}

function reloadStep(answers: BuildAnswers, reloading: boolean, gaveUp: boolean): BuildStep {
	const title = 'Reloading the project'
	if (answers.declared === false) {
		return step('reload', title, 'pending')
	}
	if (gaveUp) {
		return step(
			'reload',
			title,
			'failed',
			'The project did not come back within 3 minutes. Restart it by hand: stop the process running the project, then start it again.',
		)
	}
	if (reloading) {
		return step('reload', title, 'running', 'The project reloads to load the connection. This takes about 15 seconds.')
	}
	return step('reload', title, 'done')
}

function listedEntry(answers: BuildAnswers): DatabaseConnection | undefined {
	return answers.listed && answers.listed !== UNREACHABLE ? answers.listed : undefined
}

function connectStep(entry: DatabaseConnection | undefined): BuildStep {
	const title = 'Connecting'
	if (!entry) {
		return step('connect', title, 'pending')
	}
	if (entry.error) {
		return step('connect', title, 'failed', entry.error)
	}
	return step('connect', title, 'done', `${entry.engine} ${entry.version} · ${entry.database} · ${entry.role}`)
}

function progressText(analysis: AnalysisState): string {
	const { described, relations, profiled, toProfile, timeouts } = analysis.progress
	const late = timeouts ? `, ${timeouts} measures out of time` : ''
	return `${described} of ${relations} tables described, ${profiled} of ${toProfile} profiled${late}.`
}

function readStep(analysis: AnalysisState | undefined, connected: boolean, role: string): BuildStep {
	const title = 'Reading the database'
	if (!connected || !analysis) {
		return step('read', title, connected ? 'running' : 'pending', connected ? 'Starting the analysis.' : '')
	}
	if (analysis.status === 'running') {
		return step('read', title, 'running', progressText(analysis))
	}
	if (analysis.status === 'failed' || !analysis.proposal) {
		return step('read', title, 'failed', `The analysis failed: ${analysis.error ?? 'no proposal'}`)
	}
	const schemas = analysis.proposal.open.find((item) => item.kind === 'schemas')
	if (schemas) {
		return step('read', title, 'running', schemas.question)
	}
	const { tables } = forkSummary(analysis.proposal)
	if (tables === 0) {
		return step('read', title, 'done', `No tables user ${role} can read.`)
	}
	return step('read', title, 'done', `Read ${plural(tables, 'table', 'tables')}.`)
}

/**
 * Each step's status from the three answers. `reloadingFor` is how long the project has been
 * reloading, as the screen measured it.
 */
export function buildState(answers: BuildAnswers, reloadingFor = 0): BuildView {
	const unreachable = [answers.declared, answers.listed, answers.analysis].includes(UNREACHABLE)
	const entry = listedEntry(answers)
	const reloading = unreachable || (answers.declared === true && !entry)
	const gaveUp = reloading && reloadingFor >= RELOAD_LIMIT_MS
	const connected = !reloading && !!entry && !entry.error
	const analysis = connected && answers.analysis && answers.analysis !== UNREACHABLE ? answers.analysis : undefined
	const proposal = analysis?.status === 'done' ? analysis.proposal : undefined
	const schemas = proposal?.open.find((item) => item.kind === 'schemas')
	const summary = proposal && !schemas ? forkSummary(proposal) : undefined
	return {
		steps: [
			addStep(answers),
			reloadStep(answers, reloading, gaveUp),
			connectStep(reloading ? undefined : entry),
			readStep(analysis, connected, proposal?.database.role ?? entry?.role ?? ''),
		],
		reloading,
		gaveUp,
		connectionError: !reloading ? entry?.error : undefined,
		schemas,
		needsAnalysis: connected && !analysis,
		empty: summary?.tables === 0,
		job: analysis?.id,
		fork: summary && summary.tables > 0 ? summary : undefined,
	}
}

/** The schemas the question pre-checks: `public`, or else the one with the most tables. */
export function preferredSchemas(item: OpenItem): string[] {
	const values = item.options.map((option) => String(option.value))
	if (values.includes('public')) {
		return ['public']
	}
	const counted = item.options.map((option) => ({
		value: String(option.value),
		count: Number(/\((\d+)\)$/.exec(option.title)?.[1] ?? 0),
	}))
	const largest = counted.sort((a, b) => b.count - a.count)[0]
	return largest ? [largest.value] : []
}
