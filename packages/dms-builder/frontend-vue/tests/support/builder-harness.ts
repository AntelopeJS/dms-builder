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
	/** What `GET /dms/pagelayout` answers: the layout the DMS is serving. */
	layout: { components: Record<string, ComponentPreview> }
	/** What `POST /page/preview` answers. */
	preview: OpResult<{
		components: Record<string, ComponentPreview>
		degraded: string[]
	}>
	/** What `POST /page/blocks` answers. */
	save: OpResult<{ version: string }>
	/**
	 * Answers for any other route, keyed `METHOD /path`, taking precedence over
	 * the defaults: the resource routes answer whatever a suite needs them to.
	 */
	answers: Record<string, unknown>
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
			// A container an author places, and nothing but that: the layout
			// blocks above are the editor's to write, and a tab set holds its
			// children in regions of its own.
			block('Section', { label: 'Section', container: true }),
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
			// What `FormSchema` declares its fields as: an entry is a field or a
			// group of them — two branches of one kind, with no tag to tell them
			// apart, so only what the entry holds says which it is.
			block('Form', {
				label: 'Form',
				group: 'data',
				config: {
					title: { type: 'string', optional: true, ui: { label: 'Title' } },
					submitLabel: {
						type: 'string',
						optional: true,
						ui: { label: 'Submit button label' },
					},
					// Mirrors the DMS: addresses are the advanced view's, and a form
					// is placed showing its buttons.
					submitUrl: {
						type: 'string',
						optional: true,
						ui: { label: 'Submit to', group: 'data', widget: 'url', advanced: true },
					},
					fetchUrl: {
						type: 'string',
						optional: true,
						ui: { label: 'Load from', group: 'data', widget: 'url', advanced: true },
					},
					showActions: {
						type: 'boolean',
						optional: true,
						ui: {
							label: 'Show the buttons',
							widget: 'switch',
							initial: true,
							advanced: true,
						},
					},
					// Mirrors `SubmitMessageOptions`: both behind one switch.
					successMessage: {
						type: 'string',
						optional: true,
						ui: {
							label: 'Success message',
							placeholder: 'Data has been successfully saved',
							optIn: 'Custom submit messages',
						},
					},
					errorMessage: {
						type: 'string',
						optional: true,
						ui: {
							label: 'Error message',
							placeholder: 'An unknown error occurred',
							optIn: 'Custom submit messages',
						},
					},
					fields: {
						type: 'array',
						ui: { label: 'Fields' },
						items: {
							type: 'union',
							oneOf: [
								{
									type: 'object',
									properties: {
										id: { type: 'string', ui: { label: 'Key', derivedFrom: 'label' } },
										label: {
											type: 'string',
											optional: true,
											ui: { label: 'Label' },
										},
										fields: {
											type: 'array',
											ui: { label: 'Fields' },
											items: {
												type: 'object',
												properties: {
													id: {
														type: 'string',
														ui: { label: 'Key', derivedFrom: 'label' },
													},
													label: { type: 'string', optional: true },
												},
											},
										},
										order: { type: 'number', optional: true },
									},
									ui: { label: 'Group' },
								},
								{
									type: 'object',
									ui: { label: 'Field' },
									properties: {
										id: { type: 'string', ui: { label: 'Key', derivedFrom: 'label' } },
										label: {
											type: 'string',
											optional: true,
											ui: { label: 'Label' },
										},
										type: {
											type: 'unknown',
											'x-dataType': true,
											ui: { label: 'Type', widget: 'dataType' },
										},
										required: {
											type: 'boolean',
											optional: true,
											ui: { label: 'Required', widget: 'switch' },
										},
										defaultValue: {
											type: 'unknown',
											optional: true,
											ui: { label: 'Default value', widget: 'json', typedBy: 'type' },
										},
									},
								},
							],
						},
					},
				},
			}),
			// A block whose own type demands options, as `ChartCard` does — a
			// title and a chart to draw with — and one whose only id has a default,
			// as `PeriodSelector`'s: the scope the cards bound to a period follow.
			block('ChartCard', {
				label: 'Chart card',
				group: 'data',
				config: {
					title: { type: 'string' },
					chart: {
						type: 'unknown',
						'x-component': true,
						ui: { blockTypes: ['ChartLine', 'ChartArea'] },
					},
					description: { type: 'string', optional: true },
				},
			}),
			block('PeriodSelector', {
				label: 'Period selector',
				config: { id: { type: 'string', default: 'page' } },
				defaults: { id: 'page' },
			}),
		],
		dataTypes: [{ id: 'string', config: {} }],
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
		layout: { components: {} },
		preview: { ok: true, data: { components: {}, degraded: [] }, changes: [] },
		save: { ok: true, data: { version: 'v2' }, changes: [] },
		answers: {},
		calledPaths: () => backend.calls.map((call) => `${call.method} ${call.path}`),
	}

	function answer(method: string, path: string): unknown {
		const key = `${method} ${path}`
		if (key in backend.answers) {
			return backend.answers[key]
		}
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
			return backend.layout
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
