import { describe, expect, it, vi } from 'vitest'
import {
	type DevReloadWaiter,
	openWhenServed,
	type WaitFailure,
} from '../app/runtime/dev-reload'

/**
 * The builder never polls the site layout itself: both write paths that change
 * a page's route (create, move) hand the wait to the host's
 * `useDmsDevReload().awaitRoute`. These tests drive that seam with a waiter
 * that is held open, so the "route still 404s / route is registered" transition
 * is observable without a backend.
 */

interface ControlledWaiter {
	waiter: DevReloadWaiter
	calls: string[]
	serve: (route: string) => void
	giveUp: (route: string) => void
	fail: (route: string, err: Error) => void
}

function controlledWaiter(): ControlledWaiter {
	const calls: string[] = []
	const settlers = new Map<
		string,
		{ resolve: (served: boolean) => void; reject: (err: Error) => void }
	>()
	return {
		calls,
		serve: (route) => settlers.get(route)?.resolve(true),
		giveUp: (route) => settlers.get(route)?.resolve(false),
		fail: (route, err) => settlers.get(route)?.reject(err),
		waiter: {
			awaitRoute: (route) => {
				calls.push(route)
				return new Promise<boolean>((resolve, reject) => {
					settlers.set(route, { resolve, reject })
				})
			},
		},
	}
}

describe('openWhenServed', () => {
	it('holds the navigation until the host serves the new route', async () => {
		const push = vi.fn()
		const { waiter, calls, serve } = controlledWaiter()
		const opened = openWhenServed(
			{ devReload: waiter, router: { push }, onWaitFailure: vi.fn() },
			'/reports/new-page',
		)

		await vi.waitFor(() => expect(calls).toEqual(['/reports/new-page']))
		// The route is still unregistered: pushing now would flash a 404.
		expect(push).not.toHaveBeenCalled()

		serve('/reports/new-page')
		await opened
		expect(push).toHaveBeenCalledExactlyOnceWith('/reports/new-page')
	})

	it('navigates anyway when the wait times out, without reporting an error', async () => {
		const push = vi.fn()
		const onWaitFailure = vi.fn()
		const { waiter, giveUp } = controlledWaiter()
		const opened = openWhenServed(
			{ devReload: waiter, router: { push }, onWaitFailure },
			'/reports/slow',
		)

		giveUp('/reports/slow')
		await opened
		// A timeout is not an error: the page opens and its layout snaps in when
		// the reload finally lands.
		expect(onWaitFailure).not.toHaveBeenCalled()
		expect(push).toHaveBeenCalledExactlyOnceWith('/reports/slow')
	})

	it('reports a waiter that throws and still navigates', async () => {
		const push = vi.fn()
		const failures: WaitFailure[] = []
		const { waiter, fail } = controlledWaiter()
		const opened = openWhenServed(
			{
				devReload: waiter,
				router: { push },
				onWaitFailure: (failure) => failures.push(failure),
			},
			'/reports/broken',
		)

		fail('/reports/broken', new Error('host unreachable'))
		await opened
		expect(failures).toEqual([
			{ code: 'unsupported', detail: 'host unreachable' },
		])
		expect(push).toHaveBeenCalledExactlyOnceWith('/reports/broken')
	})

	it('describes a non-Error rejection without losing it', async () => {
		const failures: WaitFailure[] = []
		await openWhenServed(
			{
				devReload: { awaitRoute: () => Promise.reject('nope') },
				router: { push: vi.fn() },
				onWaitFailure: (failure) => failures.push(failure),
			},
			'/reports/odd',
		)
		expect(failures).toEqual([{ code: 'unsupported', detail: 'nope' }])
	})
})
