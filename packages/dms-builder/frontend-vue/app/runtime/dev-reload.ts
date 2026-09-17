/**
 * The builder's single entry point into the host's dev-reload mechanism.
 *
 * Writing a page -- creating it, or moving it to another category -- rewrites
 * its registration: the backend module reloads and re-registers its pages one
 * at a time, so the new route is unserved for a moment. Navigating in that
 * window renders the page without its layout, or 404s. The host solves this
 * once, in `useDmsDevReload()`, and the builder routes every such navigation
 * through here rather than growing a retry loop of its own.
 */

/**
 * The slice of the host's `useDmsDevReload()` composable the builder needs:
 * resolve `true` once the committed site layout serves `route`, `false` on
 * timeout.
 */
export interface DevReloadWaiter {
	awaitRoute: (route: string) => Promise<boolean>
}

export interface RouterLike {
	push: (route: string) => unknown
}

/** A wait that could not answer at all, shaped as a builder session error. */
export interface WaitFailure {
	code: 'unsupported'
	detail: string
}

export interface OpenWhenServedContext {
	devReload: DevReloadWaiter
	router: RouterLike
	onWaitFailure: (failure: WaitFailure) => void
}

/**
 * Wait for the host to serve `route`, then navigate -- and navigate either way.
 *
 * `awaitRoute` answers `false` when it gives up rather than throwing, so a
 * timeout is not an error: the page opens and its layout snaps in when the
 * reload lands, which is the update animation the host plays anyway. A
 * rejection is different -- the host could not tell us anything -- but it is
 * still no reason to strand the user on the panel, so it is reported and the
 * navigation goes ahead unwaited.
 */
export async function openWhenServed(
	ctx: OpenWhenServedContext,
	route: string,
): Promise<void> {
	try {
		await ctx.devReload.awaitRoute(route)
	} catch (error) {
		ctx.onWaitFailure({
			code: 'unsupported',
			detail: error instanceof Error ? error.message : String(error),
		})
	}
	await ctx.router.push(route)
}
