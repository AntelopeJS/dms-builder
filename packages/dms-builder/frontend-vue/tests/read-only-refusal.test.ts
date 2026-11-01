import { afterEach, expect, it, vi } from 'vitest'
import { useBuilder } from '../app/runtime/session'
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
