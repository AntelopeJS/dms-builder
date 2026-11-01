import { afterEach, expect, it, vi } from 'vitest'
import { useBuilder } from '../app/runtime/session'
import { openWhenServed } from '../app/runtime/dev-reload'
import { installFakeHost } from './support/builder-harness'

afterEach(() => vi.unstubAllGlobals())

it.each([true, false])('keeps a failed category write failed without a second refusal notice (%s)', async (marked) => {
	installFakeHost()
	const error = Object.assign(new Error('Forbidden'), {
		response: new Response(null, { status: 403, headers: marked ? { 'x-dms-readonly': '1' } : {} }),
	})
	const notices: string[] = []
	const presented = new WeakSet<Response>()
	const consume = (failure: unknown) => {
		if (failure !== error || !marked) return false
		if (!presented.has(error.response)) notices.push('read-only')
		presented.add(error.response)
		return true
	}
	vi.stubGlobal('useReadOnlyRefusal', () => consume)
	vi.stubGlobal('useAuthFetch', () => ({
		$authFetch: async () => { consume(error); throw error },
	}))
	const builder = useBuilder()
	builder.close()
	await builder.createCategory({ name: 'reports', displayName: 'Reports' })
	expect(notices).toEqual(marked ? ['read-only'] : [])
	expect(builder.session.value.error).toEqual(marked ? null : { code: 'unsupported', detail: 'The request failed: Forbidden' })
})

it.each(['close', 'navigate'])('keeps the draft after a consumed save refusal during %s', async (action) => {
	const backend = installFakeHost()
	const builder = useBuilder()
	builder.close()
	await builder.open('/reports/sales')
	builder.addBlock('Text')
	backend.save = { ok: false, error: { code: 'unsupported', detail: 'Forbidden' }, noticeConsumed: true }
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
	expect(builder.session.value.error).toBeNull()
	expect(builder.session.value.saving).toBe(false)
	builder.close()
})

it.each([true, false])('keeps navigation after a failed route wait without a second refusal notice (%s)', async (marked) => {
	const error = new Error('Forbidden')
	const notices = marked ? ['read-only'] : []
	const routes: string[] = []
	await openWhenServed({
		devReload: { awaitRoute: async () => { throw error } },
		router: { push: (route) => routes.push(route) },
		consumeRefusal: (failure) => marked && failure === error,
		onWaitFailure: () => notices.push('local'),
	}, '/reports/sales')
	expect(notices).toEqual([marked ? 'read-only' : 'local'])
	expect(routes).toEqual(['/reports/sales'])
})
