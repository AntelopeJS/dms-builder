/**
 * A backend the builder's HTTP client can be driven against, plus the host
 * globals the layer expects a Nuxt build to auto-import.
 *
 * The editor is behind an authentication these tests do not cross: everything
 * below `useAuthFetch` is the module's own wire format, so a recorded fake of
 * it exercises the real `useBuilder()` controller without a server.
 */
import type {
	BlockCatalog,
	ComponentPreview,
	OpResult,
	PageStructure,
} from '../../app/runtime/types'

export interface RecordedCall {
	method: string
	path: string
	body?: Record<string, unknown>
	query?: Record<string, string>
}

export interface FakeBackend {
	calls: RecordedCall[]
	catalog: BlockCatalog
	structure: PageStructure
	/** What `POST /page/preview` answers. */
	preview: OpResult<{
		components: Record<string, ComponentPreview>
		degraded: string[]
	}>
	/** What `POST /page/blocks` answers. */
	save: OpResult<{ version: string }>
	calledPaths: () => string[]
}

export function testCatalog(): BlockCatalog {
	const block = (
		type: string,
		extra: Partial<BlockCatalog['blocks'][number]> = {},
	) => ({
		type,
		componentName: `Dms${type}`,
		label: type,
		group: 'layout',
		container: false,
		config: {},
		shapeSource: 'test',
		...extra,
	})
	// What the stacks declare, their own defaults included: they centre what
	// they hold, and `stretch` is the alignment that fills the stack.
	const stack = {
		alignment: {
			type: 'string',
			enum: ['start', 'center', 'end', 'stretch'],
			default: 'center',
			ui: { label: 'Alignment', group: 'layout', widget: 'segmented' },
		},
		distribution: { type: 'string', default: 'start' },
		spacing: { type: 'string', default: '8px' },
	}
	return {
		blocks: [
			block('Text', {
				label: 'Text',
				group: 'content',
				description: 'A paragraph, a heading, or a line of prose.',
				config: { content: { type: 'string', optional: true } },
			}),
			// Mirrors what `ListBlockTypes()` declares for these four.
			block('HStack', {
				label: 'Horizontal stack',
				container: true,
				config: { ...stack, wrap: { type: 'boolean', optional: true } },
			}),
			block('VStack', {
				label: 'Vertical stack',
				container: true,
				config: { ...stack },
			}),
			block('Grid', {
				label: 'Grid',
				container: true,
				allowedChildren: ['GridRow'],
				config: { gap: { type: 'string', optional: true } },
			}),
			block('GridRow', {
				label: 'Grid row',
				container: true,
				childMeta: { colSpan: { type: 'number', optional: true } },
			}),
			// The one container that holds its children through its own slots. Its
			// options mirror what `TabSchema` declares: a tab is a title, an id the
			// children attach to, and whatever else it may carry.
			block('Tab', {
				label: 'Tabs',
				container: true,
				dynamicSlots: { optionPath: 'items', idKey: 'slot', labelKey: 'label' },
				config: {
					items: {
						type: 'array',
						ui: { label: 'Tabs' },
						items: {
							type: 'object',
							properties: {
								label: { type: 'string', ui: { label: 'Label' } },
								slot: { type: 'string', ui: { label: 'Slot' } },
								icon: {
									type: 'string',
									optional: true,
									ui: { label: 'Icon', widget: 'icon' },
								},
								// A tab's badge is a count, a word, or a badge of its
								// own: a union of kinds, with no tag to tell them apart.
								badge: {
									type: 'union',
									optional: true,
									oneOf: [
										{ type: 'string' },
										{ type: 'number' },
										{
											type: 'object',
											properties: {
												label: { type: 'string', optional: true },
												color: {
													type: 'string',
													optional: true,
													ui: { widget: 'color' },
												},
											},
										},
									],
								},
							},
						},
					},
				},
			}),
			block('TableView', {
				label: 'Table',
				group: 'data',
				controllerArg: true,
			}),
		],
		dataTypes: [],
		reservedFieldNames: ['_id'],
		generatedAt: '2026-01-01T00:00:00.000Z',
	}
}

/** A page with two root blocks, the shape the canvas is normally opened on. */
export function testStructure(): PageStructure {
	return {
		page: {
			ref: '/reports/sales',
			id: 'sales',
			displayName: 'Sales',
			category: 'reports',
			filepath: 'pages/sales.ts',
		},
		blocks: [
			{
				path: 'title',
				name: 'title',
				type: 'Text',
				editable: true,
				config: { content: 'Sales' },
			},
			{
				path: 'intro',
				name: 'intro',
				type: 'Text',
				editable: true,
				config: { content: 'Intro' },
			},
		],
		queries: [],
		version: 'v1',
	}
}

export function installFakeHost(): FakeBackend {
	const backend: FakeBackend = {
		calls: [],
		catalog: testCatalog(),
		structure: testStructure(),
		preview: { ok: true, data: { components: {}, degraded: [] }, changes: [] },
		save: { ok: true, data: { version: 'v2' }, changes: [] },
		calledPaths: () => backend.calls.map((call) => `${call.method} ${call.path}`),
	}

	function answer(method: string, path: string): unknown {
		if (method === 'GET' && path === '/api/builder/catalog') {
			return backend.catalog
		}
		if (method === 'GET' && path === '/api/builder/page') {
			return { ok: true, data: backend.structure, changes: [] }
		}
		if (method === 'GET' && path === '/api/builder/resources') {
			return []
		}
		if (method === 'GET' && path === '/api/builder/pages') {
			return []
		}
		if (method === 'GET' && path === '/api/builder/categories') {
			return []
		}
		if (method === 'GET' && path === '/dms/pagelayout') {
			return { components: {} }
		}
		if (method === 'POST' && path === '/api/builder/page/preview') {
			return backend.preview
		}
		if (method === 'POST' && path === '/api/builder/page/blocks') {
			return backend.save
		}
		return { ok: true, data: {}, changes: [] }
	}

	const useAuthFetch = () => ({
		$authFetch: (
			path: string,
			init: {
				method: string
				body?: Record<string, unknown>
				query?: Record<string, string>
			},
		) => {
			backend.calls.push({
				method: init.method,
				path,
				body: init.body,
				query: init.query,
			})
			return Promise.resolve(answer(init.method, path))
		},
	})

	Object.assign(globalThis, { useAuthFetch })
	return backend
}
