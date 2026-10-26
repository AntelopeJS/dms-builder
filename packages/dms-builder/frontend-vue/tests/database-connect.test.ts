import { describe, expect, it } from 'vitest'
import {
	type ConnectForm,
	connectSteps,
	connectionUrl,
	defaultNames,
	detailsFields,
	emptyFields,
	isConnectionUrl,
	missingField,
	parseConnectionUrl,
} from '../app/runtime/database-connect'

function form(overrides: Partial<ConnectForm> = {}): ConnectForm {
	return {
		name: 'ERP',
		engine: 'postgres',
		fields: { ...emptyFields('postgres'), host: 'db.example', database: 'erp', user: 'reader', password: 's3cret' },
		overrides: {},
		...overrides,
	}
}

describe('the names the builder manages for a connection', () => {
	it('follows the name under a prefix no ordinary module uses', () => {
		expect(defaultNames('Client ERP', 'postgres')).toEqual({
			driverModule: 'builder-db-client-erp',
			tablesModule: 'builder-db-client-erp-tables',
			variable: 'BUILDER_DB_CLIENT_ERP_URL',
			version: '>=0.2.1 <1.0.0',
		})
	})

	it('keeps a name the integrator changed, and derives the others', () => {
		const steps = connectSteps(form({ overrides: { tablesModule: 'erp-tables' } }), { modules: [] })
		expect(steps.map((step) => `${step.op}:${step.id}`)).toEqual([
			'AddModule:builder-db-erp',
			'CreateLocalModule:erp-tables',
			'ConfigureModule:dms-builder',
		])
	})
})

describe('the wiring of a database', () => {
	it('adds the driver below every other database provider and touches no other module than the builder', () => {
		const [driver, tables, builder] = connectSteps(form(), { modules: ['mongodb', 'dms-builder'] })
		expect(driver).toMatchObject({
			op: 'AddModule',
			entry: {
				source: { type: 'package', package: '@antelopejs/postgres' },
				env: { url: 'BUILDER_DB_ERP_URL' },
				exportPriority: { '@antelopejs/interface-database': -1 },
			},
		})
		expect(tables).toMatchObject({
			path: 'modules/builder-db-erp-tables',
			entry: { importOverrides: [{ interface: '@antelopejs/interface-database', source: 'builder-db-erp' }] },
		})
		expect(builder).toMatchObject({ id: 'dms-builder' })
	})

	it('gives dms-ai a connection when the project has it', () => {
		const steps = connectSteps(form(), { modules: ['dms-builder', 'dms-ai'] })
		expect(steps.at(-1)).toMatchObject({
			op: 'ConfigureModule',
			id: 'dms-ai',
			entry: { importOverrides: [{ source: 'builder-db-erp', id: 'erp' }] },
		})
	})

	it('pins the DMS module to the project\'s own database when the builder says it needs it', () => {
		const steps = connectSteps(form(), {
			modules: ['dms', 'mongodb', 'dms-builder'],
			databasePin: { module: 'dms', provider: 'mongodb' },
		})
		expect(steps.at(-1)).toEqual({
			op: 'ConfigureModule',
			id: 'dms',
			entry: { importOverrides: [{ interface: '@antelopejs/interface-database', source: 'mongodb' }] },
		})
	})

	it('never carries the connection details into the configuration', () => {
		expect(JSON.stringify(connectSteps(form(), { modules: ['dms-ai'] }))).not.toMatch(/s3cret|db\.example|postgres:\/\//)
	})

	it('waits for a name, a host, a database and a user', () => {
		expect(missingField(form())).toBeUndefined()
		expect(missingField(form({ name: ' - ' }))).toBe('a name')
		expect(missingField(form({ fields: { ...form().fields, user: '' } }))).toBe('a user')
	})
})

describe('a module kept from a removed connection', () => {
	it('is added as it is, under its folder name, and told the new connection', () => {
		const adopt = { path: 'modules/old-tables', name: 'old-tables', connection: 'legacy' }
		const steps = connectSteps(form({ adopt, overrides: { tablesModule: 'old-tables' } }), { modules: [] })
		expect(steps[1]).toEqual({
			op: 'AdoptLocalModule',
			id: 'old-tables',
			path: 'modules/old-tables',
			entry: { importOverrides: [{ interface: '@antelopejs/interface-database', source: 'builder-db-erp' }] },
			connection: 'erp',
		})
	})
})

describe('the details of a connection made before', () => {
	it('fill the fields, SSL from its mode, the password left empty', () => {
		const fields = detailsFields('postgres', {
			scheme: 'postgres',
			host: 'db.example',
			port: '5433',
			database: 'erp main',
			user: 'read@er',
			hasPassword: true,
			options: { sslmode: 'require', application_name: 'dms' },
		})
		expect(fields).toEqual({
			host: 'db.example',
			port: '5433',
			database: 'erp main',
			user: 'read@er',
			password: '',
			ssl: true,
			options: { application_name: 'dms' },
		})
		expect(connectionUrl('postgres', fields)).toBe(
			'postgres://read%40er@db.example:5433/erp%20main?application_name=dms&sslmode=require',
		)
	})
})

describe('a connection URL', () => {
	it('fills the fields from a pasted URL, decoding its credentials', () => {
		expect(
			parseConnectionUrl('postgres', 'postgresql://re%40der:p%40ss%2Fw@db.example:6432/erp?sslmode=require&application_name=dms'),
		).toEqual({
			host: 'db.example',
			port: '6432',
			database: 'erp',
			user: 're@der',
			password: 'p@ss/w',
			ssl: true,
			options: { application_name: 'dms' },
		})
	})

	it('takes the default port when the URL has none, and SSL off without sslmode', () => {
		expect(parseConnectionUrl('postgres', 'postgres://u@h/db')).toMatchObject({ port: '5432', ssl: false, password: '' })
	})

	it('keeps a strict SSL mode as it was pasted', () => {
		const fields = parseConnectionUrl('postgres', 'postgres://u:p@h/db?sslmode=verify-full')
		expect(fields.ssl).toBe(true)
		expect(connectionUrl('postgres', fields)).toBe('postgres://u:p@h:5432/db?sslmode=verify-full')
	})

	it('refuses a URL of another engine, or no URL at all', () => {
		expect(() => parseConnectionUrl('postgres', 'mysql://u@h/db')).toThrow(/PostgreSQL/)
		expect(() => parseConnectionUrl('postgres', 'db.example')).toThrow()
	})

	it('writes back what it read, credentials encoded and options kept', () => {
		const pasted = 'postgres://re%40der:p%40ss@db.example:6432/erp?application_name=dms&sslmode=require'
		expect(connectionUrl('postgres', parseConnectionUrl('postgres', pasted))).toBe(pasted)
	})

	it('builds one from the fields, with sslmode when SSL is on', () => {
		expect(connectionUrl('postgres', { ...form().fields, ssl: true })).toBe(
			'postgres://reader:s3cret@db.example:5432/erp?sslmode=require',
		)
	})

	it('is recognised by its scheme when pasted into the host', () => {
		expect(isConnectionUrl('postgres', ' postgresql://h/db')).toBe(true)
		expect(isConnectionUrl('postgres', 'db.example')).toBe(false)
	})
})
