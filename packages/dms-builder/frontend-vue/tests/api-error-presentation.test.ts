import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useApiErrorPresenter } from '#dms-core/app/composables/useApiErrorPresenter'
import { useBuilderApi } from '../app/runtime/api'
import { useBuilder } from '../app/runtime/session'
import { installFakeHost } from './support/builder-harness'

beforeEach(() => vi.stubEnv('SSR', false))
afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllEnvs()
})

it('presents a refused category write once with the server key and severity', async () => {
	const backend = installFakeHost()
	const data = { message: 'error.read_only_demo', severity: 'warning' }
	const error = Object.assign(new Error('Forbidden'), {
		response: Object.assign(new Response(JSON.stringify(data), { status: 403 }), { _data: data }),
		data,
	})
	backend.answers['POST /api/builder/categories'] = error
	const builder = useBuilder()
	builder.close()
	await builder.createCategory({ name: 'reports', displayName: 'Reports' })
	expect(backend.notices).toMatchObject([{ title: 'This demo is read-only.', color: 'warning' }])
	useApiErrorPresenter().presentError(new Error('Wrapped failure', { cause: error }), {
		fallbackKey: 'error.500.description',
	})

	expect(backend.notices).toMatchObject([{ title: 'This demo is read-only.', color: 'warning' }])
	expect(builder.session.value.error).toMatchObject({ detail: 'This demo is read-only.' })
	builder.close()
})

it.each([
	{ status: 403, data: { message: 'error.read_only_demo' }, title: 'This demo is read-only.', color: 'warning' },
	{ status: 403, data: { message: 'error.read_only_demo', severity: 'info' }, title: 'This demo is read-only.', color: 'info' },
	{ status: 500, data: { message: 'An internal stack trace' }, title: 'An unexpected error occurred.', color: 'error' },
	{ status: undefined, data: undefined, title: 'An unexpected error occurred.', color: 'error' },
])('preserves the failure reason and tone for status $status and $color', async ({ status, data, title, color }) => {
	const backend = installFakeHost()
	backend.answers['POST /api/builder/categories'] = Object.assign(new Error('Request failed'), {
		response: status === undefined ? undefined : new Response(null, { status }),
		data,
	})
	const result = await useBuilderApi().createCategory({ name: 'reports', displayName: 'Reports' })
	expect(result).toEqual({ ok: false, error: { code: 'unsupported', detail: title } })
	expect(backend.notices).toMatchObject([{ title, color }])
})

it.each(['close', 'navigate'])('keeps the unsaved draft after a failed save during %s', async (action) => {
	vi.useFakeTimers()
	const backend = installFakeHost()
	const builder = useBuilder()
	builder.close()
	await builder.open('/reports/sales')
	builder.addBlock('Text')
	backend.answers['POST /api/builder/page/blocks'] = Object.assign(new Error('Forbidden'), {
		response: new Response(null, { status: 403 }),
		data: { message: 'error.read_only_demo', severity: 'warning' },
	})
	if (action === 'close') {
		builder.leave()
		await builder.resolveClose(true)
	} else {
		builder.followRoute('/reports/other')
		await builder.resolvePending(true)
	}
	expect(builder.session.value.active).toBe(true)
	expect(builder.session.value.pageRef).toBe('/reports/sales')
	expect(builder.dirty.value).toBe(true)
	expect(builder.session.value.saving).toBe(false)
	expect(backend.notices).toMatchObject([{ title: 'This demo is read-only.', color: 'warning' }])
	builder.close()
})
