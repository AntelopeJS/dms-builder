/**
 * Mounts the builder's components without a DOM.
 *
 * The package carries no browser environment and no component-test library,
 * and adding either would change its manifest. Vue's renderer is pluggable, so
 * the tree is rendered into plain objects instead: the templates run for real —
 * `v-if`, `v-for`, modifiers, slots, recursion — and every handler the template
 * binds is recorded on the node it was bound to, ready to be fired.
 */
import { createRenderer, h, type App, type Component } from 'vue'

export interface TestRect {
	top: number
	left: number
	right: number
	bottom: number
	width: number
	height: number
}

export interface TestNode {
	kind: 'element' | 'text' | 'comment'
	tag: string
	props: Record<string, unknown>
	children: TestNode[]
	parent: TestNode | null
	text: string
	/** Zero, for the components that place themselves by measuring an element. */
	getBoundingClientRect: () => TestRect
}

const EMPTY_RECT: TestRect = {
	top: 0,
	left: 0,
	right: 0,
	bottom: 0,
	width: 0,
	height: 0,
}

function node(kind: TestNode['kind'], tag: string, text = ''): TestNode {
	return {
		kind,
		tag,
		text,
		props: {},
		children: [],
		parent: null,
		getBoundingClientRect: () => EMPTY_RECT,
	}
}

function detach(child: TestNode): void {
	const siblings = child.parent?.children
	const at = siblings?.indexOf(child) ?? -1
	if (siblings && at !== -1) {
		siblings.splice(at, 1)
	}
	child.parent = null
}

const { createApp } = createRenderer<TestNode, TestNode>({
	createElement: (tag) => node('element', tag),
	createText: (text) => node('text', '#text', text),
	createComment: (text) => node('comment', '#comment', text),
	setText: (target, text) => {
		target.text = text
	},
	setElementText: (target, text) => {
		target.children = []
		target.text = text
	},
	insert: (child, parent, anchor) => {
		detach(child)
		child.parent = parent
		const at = anchor ? parent.children.indexOf(anchor) : -1
		if (at === -1) {
			parent.children.push(child)
		} else {
			parent.children.splice(at, 0, child)
		}
	},
	remove: detach,
	parentNode: (target) => target.parent,
	nextSibling: (target) => {
		const siblings = target.parent?.children ?? []
		return siblings[siblings.indexOf(target) + 1] ?? null
	},
	setScopeId: () => {},
	patchProp: (target, key, _prev, next) => {
		target.props[key] = next
	},
})

/**
 * A stand-in for a component the Nuxt build auto-imports: renders as an element
 * of its own name, keeps every prop and handler, and passes its slots through.
 */
export function stub(name: string): Component {
	return {
		name,
		inheritAttrs: false,
		setup(_props, { slots, attrs }) {
			return () =>
				h(name, attrs, [
					...(slots.default?.() ?? []),
					...Object.entries(slots)
						.filter(([id]) => id !== 'default')
						.flatMap(([id, render]) => [h(`slot:${id}`, render?.() ?? [])]),
				])
		},
	}
}

export interface Mounted {
	root: TestNode
	app: App<TestNode>
	warnings: string[]
	unmount: () => void
}

export interface MountOptions {
	props?: Record<string, unknown>
	/** Components registered globally, the way the Nuxt build auto-imports them. */
	components?: Record<string, Component>
}

export function mount(component: Component, options: MountOptions = {}): Mounted {
	const root = node('element', '#root')
	const app = createApp(component, options.props)
	const warnings: string[] = []
	app.config.warnHandler = (message) => warnings.push(message)
	for (const name of ['UIcon', 'UButton', 'UInput', 'UBadge', 'UTooltip']) {
		app.component(name, stub(name))
	}
	for (const [name, impl] of Object.entries(options.components ?? {})) {
		app.component(name, impl)
	}
	app.mount(root)
	return { root, app, warnings, unmount: () => app.unmount() }
}

/**
 * A `document` and a `window` for the components that reach for one on mount:
 * an open menu closes on the next click anywhere, and the overlay measures the
 * region the host page occupies before it places itself.
 *
 * Nothing here has a layout, so the measurement finds no content element and
 * falls back to the viewport — which is the same path a host that marks none
 * takes. The listeners only have to be registrable; nothing fires them.
 */
export function installDocumentStub(): void {
	if ('document' in globalThis) {
		return
	}
	Object.assign(globalThis, {
		document: {
			addEventListener: () => {},
			removeEventListener: () => {},
			querySelector: () => null,
			body: null,
		},
		window: {
			addEventListener: () => {},
			removeEventListener: () => {},
		},
		// The overlay follows the page it sits over: it listens for scroll and
		// resize on the global object, which is `window` in a browser and this
		// one here.
		addEventListener: () => {},
		removeEventListener: () => {},
		innerWidth: 1280,
		innerHeight: 800,
	})
}

export function walk(target: TestNode): TestNode[] {
	return [target, ...target.children.flatMap(walk)]
}

export function findAll(
	target: TestNode,
	predicate: (candidate: TestNode) => boolean,
): TestNode[] {
	return walk(target).filter(predicate)
}

export function byClass(target: TestNode, fragment: string): TestNode[] {
	return findAll(target, (candidate) =>
		String(candidate.props.class ?? '').includes(fragment),
	)
}

/** Everything the node renders as text, children included. */
export function textOf(target: TestNode): string {
	return walk(target)
		.map((candidate) => candidate.text)
		.join('')
		.replace(/\s+/g, ' ')
		.trim()
}

export interface FakeEvent {
	type: string
	prevented: boolean
	stopped: boolean
	preventDefault: () => void
	stopPropagation: () => void
	currentTarget: unknown
	target: unknown
	/** Where the pointer is, for the handlers that measure it against a box. */
	clientX: number
	clientY: number
	dataTransfer: { data: Record<string, string>; setData: (k: string, v: string) => void }
}

export function fakeEvent(type: string, extra: Partial<FakeEvent> = {}): FakeEvent {
	const data: Record<string, string> = {}
	const event: FakeEvent = {
		type,
		prevented: false,
		stopped: false,
		preventDefault: () => {
			event.prevented = true
		},
		stopPropagation: () => {
			event.stopped = true
		},
		currentTarget: { getBoundingClientRect: () => ({ left: 0, bottom: 0 }) },
		target: null,
		clientX: 0,
		clientY: 0,
		dataTransfer: { data, setData: (key, value) => void (data[key] = value) },
		...extra,
	}
	return event
}

/**
 * A `dragover` at a point inside a box, as the browser reports it.
 *
 * The handlers under test measure the pointer against the element it is over,
 * which is all they read of the DOM: `rect` is that element's box.
 */
export function pointerOver(
	rect: Partial<TestRect>,
	pointer: { x?: number; y?: number } = {},
): FakeEvent {
	const box: TestRect = { ...EMPTY_RECT, ...rect }
	return fakeEvent('dragover', {
		currentTarget: { getBoundingClientRect: () => box },
		clientX: pointer.x ?? 0,
		clientY: pointer.y ?? 0,
	})
}

/** Fire a handler the template bound, e.g. `fire(zone, 'drop')`. */
export function fire(
	target: TestNode,
	name: string,
	event: FakeEvent = fakeEvent(name),
): FakeEvent {
	const key = `on${name.charAt(0).toUpperCase()}${name.slice(1)}`
	const handler = target.props[key]
	if (typeof handler !== 'function') {
		throw new Error(
			`no ${key} handler on <${target.tag}>; it has ${Object.keys(target.props).join(', ') || 'no props'}`,
		)
	}
	;(handler as (event: unknown) => void)(event)
	return event
}

export function hasHandler(target: TestNode, name: string): boolean {
	const key = `on${name.charAt(0).toUpperCase()}${name.slice(1)}`
	return typeof target.props[key] === 'function'
}
