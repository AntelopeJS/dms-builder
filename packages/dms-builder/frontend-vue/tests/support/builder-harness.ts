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
	/** What each `useConfirm().confirm` was asked, in order. */
	confirms: Array<{
		title: string
		description: string
		confirmLabel?: string
		confirmColor?: string
	}>
	/** How the next confirmations are answered: yes unless a suite says no. */
	confirmAnswer: boolean
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
			// Mirrors `TableViewSchema`: row actions offered unless turned off,
			// flattened into one list, and the forms and displays left to code.
			block('TableView', {
				label: 'Table',
				group: 'data',
				controllerArg: true,
				config: {
					caption: {
						type: 'string',
						optional: true,
						ui: { label: 'Table title', order: 1, group: 'content' },
					},
					labelKey: {
						type: 'string',
						optional: true,
						ui: {
							label: 'Label field',
							order: 2,
							group: 'content',
							widget: 'field',
							fieldAspect: 'listable',
						},
					},
					rowActions: {
						type: 'object',
						optional: true,
						ui: { label: 'Features', group: 'features', flatten: true },
						properties: {
							...Object.fromEntries(
								(
									[
										['add', 'Adding data', true],
										['edit', 'Editing data', true],
										['delete', 'Deleting data', true],
										['details', 'View details', false],
										['duplicate', 'Duplicate', true],
										['archive', 'Archive', true],
										['restore', 'Restore', true],
										['copyLink', 'Copy link', true],
									] as const
								).map(([key, label, offered], order) => [
									key,
									{
										type: 'union',
										...(offered ? { default: true } : { optional: true }),
										oneOf: [
											{ type: 'boolean' },
											{
												type: 'object',
												properties: {
													isEnabled: { type: 'boolean', optional: true },
													rule: { type: 'unknown', optional: true },
												},
											},
										],
										ui: { label, order, group: 'features', widget: 'switch' },
									},
								]),
							),
							hasSelection: {
								type: 'boolean',
								optional: true,
								ui: { label: 'Row selection', order: 11, group: 'features', widget: 'switch' },
							},
						},
					},
					archiveMode: {
						type: 'boolean',
						optional: true,
						ui: { label: 'Ghost delete', order: 4, group: 'features', widget: 'switch' },
					},
					defaultSort: {
						type: 'object',
						optional: true,
						ui: { label: 'Default sort', group: 'data' },
						properties: {
							field: {
								type: 'string',
								ui: { widget: 'field', fieldAspect: 'sortable' },
							},
							desc: { type: 'boolean', optional: true },
						},
					},
					realtime: {
						type: 'boolean',
						default: true,
						ui: { label: 'Realtime updates', group: 'advanced', widget: 'switch' },
					},
				},
			}),
			// What `FormSchema` declares its fields as: an entry is a field or a
			// group of them — two branches of one kind, with no tag to tell them
			// apart, so only what the entry holds says which it is.
			block('Form', {
				label: 'Form',
				group: 'data',
				config: {
					title: { type: 'string', optional: true, ui: { label: 'Title' } },
					description: {
						type: 'string',
						optional: true,
						ui: { label: 'Description', widget: 'textarea' },
					},
					fieldsOrientation: {
						type: 'string',
						optional: true,
						enum: ['horizontal', 'vertical'],
						ui: { label: 'Field orientation', group: 'layout', widget: 'segmented' },
					},
					redirectOnSuccess: {
						type: 'string',
						optional: true,
						ui: { label: 'Redirect on success', group: 'behavior' },
					},
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
										description: {
											type: 'string',
											optional: true,
											ui: { label: 'Help text', widget: 'textarea' },
										},
										disabled: {
											type: 'boolean',
											optional: true,
											ui: { label: 'Disabled', widget: 'switch' },
										},
										required: {
											type: 'boolean',
											optional: true,
											ui: { label: 'Required', widget: 'switch' },
										},
										localized: {
											type: 'boolean',
											optional: true,
											ui: { label: 'Translatable', widget: 'switch' },
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
		confirms: [],
		confirmAnswer: true,
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

	// The DMS's own confirmation dialog, answered without being shown.
	const useConfirm = () => ({
		confirm: (options: FakeBackend['confirms'][number]) => {
			backend.confirms.push(options)
			return Promise.resolve(backend.confirmAnswer)
		},
	})

	Object.assign(globalThis, { useAuthFetch, useConfirm })
	return backend
}
