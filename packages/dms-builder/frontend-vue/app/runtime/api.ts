import { API_PREFIX, PAGE_LAYOUT_PATH } from './constants'
import type {
	AddQueryInput,
	BlockCatalog,
	CategorySummary,
	CreateCategoryInput,
	CreatePageInput,
	CreateResourceInput,
	FieldAspects,
	FieldSpec,
	OpResult,
	PageDraft,
	PageLayoutPreview,
	PageLayoutPayload,
	PageStructure,
	PageSummary,
	DataSourceDescriptor,
	QueryPreview,
	QueryTemplateDescriptor,
	ResourceStructure,
	ResourceSummary,
} from './types'

interface SaveBody {
	page: string
	draft: PageDraft
	expectedVersion?: string
}

/**
 * A request that came back with no answer from the module: the network dropped
 * it, or the server failed before the module could word a refusal.
 *
 * Shaped as the refusal it stands for, so every caller that branches on `ok`
 * shows it the way it shows the module's own — rather than a rejection nobody
 * catches, which leaves a spinner stopped and nothing said.
 */
function unanswered<T>(error: unknown): OpResult<T> {
	const reason = error instanceof Error ? error.message : String(error)
	return {
		ok: false,
		error: { code: 'unsupported', detail: `The request failed: ${reason}` },
	}
}

/**
 * The typed client over the module's HTTP API. Plain reads answer with their
 * value; writes, and the reads the module answers with an `OpResult`, answer
 * with one the caller branches on — a request that failed outright included.
 */
export function useBuilderApi() {
	const { $authFetch } = useAuthFetch()

	function get<T>(path: string, query?: Record<string, string>): Promise<T> {
		return $authFetch<T>(`${API_PREFIX}${path}`, { method: 'GET', query })
	}

	function answered<T>(request: Promise<OpResult<T>>): Promise<OpResult<T>> {
		return request.catch((error: unknown) => unanswered<T>(error))
	}

	function read<T>(
		path: string,
		query: Record<string, string>,
	): Promise<OpResult<T>> {
		return answered(get<OpResult<T>>(path, query))
	}

	function post<T>(
		path: string,
		body: Record<string, unknown>,
	): Promise<OpResult<T>> {
		return answered(
			$authFetch<OpResult<T>>(`${API_PREFIX}${path}`, { method: 'POST', body }),
		)
	}

	function put<T>(
		path: string,
		body: Record<string, unknown>,
	): Promise<OpResult<T>> {
		return answered(
			$authFetch<OpResult<T>>(`${API_PREFIX}${path}`, { method: 'PUT', body }),
		)
	}

	function remove<T>(
		path: string,
		query: Record<string, string>,
	): Promise<OpResult<T>> {
		return answered(
			$authFetch<OpResult<T>>(`${API_PREFIX}${path}`, {
				method: 'DELETE',
				query,
			}),
		)
	}

	return {
		catalog: () => get<BlockCatalog>('/catalog'),
		pages: () => get<PageSummary[]>('/pages'),
		categories: () => get<CategorySummary[]>('/categories'),
		createPage: (input: CreatePageInput) =>
			post<{ ref: string; filepath: string }>(
				'/pages',
				input as unknown as Record<string, unknown>,
			),
		deletePage: (ref: string) => remove<void>('/page', { ref }),
		createCategory: (input: CreateCategoryInput) =>
			post<{ ref: string }>(
				'/categories',
				input as unknown as Record<string, unknown>,
			),
		deleteCategory: (ref: string) => remove<void>('/category', { ref }),
		structure: (ref: string) => read<PageStructure>('/page', { ref }),
		resources: () => get<ResourceSummary[]>('/resources'),
		resource: (ref: string) => read<ResourceStructure>('/resource', { ref }),
		preview: (page: string, draft: PageDraft) =>
			post<PageLayoutPreview>('/page/preview', { page, draft }),
		save: (body: SaveBody) =>
			post<{ version: string }>(
				'/page/blocks',
				body as unknown as Record<string, unknown>,
			),
		refresh: () =>
			$authFetch<{ ok: boolean }>(`${API_PREFIX}/refresh`, {
				method: 'POST',
				body: {},
			}),
		/**
		 * The page as the DMS serves it, outside the builder's own API. It is
		 * what a block the preview cannot build falls back to — a TableView needs
		 * its DataAPI class, which only the running page holds.
		 */
		pageLayout: (slug: string) =>
			$authFetch<PageLayoutPayload>(PAGE_LAYOUT_PATH, {
				method: 'GET',
				query: { slug },
			}),
		deleteResource: (ref: string) => remove<void>('/resource', { ref }),
		configureCategory: (category: string, patch: Record<string, unknown>) =>
			put<void>('/category', { category, patch }),
		configureQuery: (query: string, patch: Record<string, unknown>) =>
			put<void>('/queries', { query, patch }),
		// The ref comes back because a patch can change it: a page's category
		// decides its route.
		configurePage: (page: string, patch: Record<string, unknown>) =>
			post<{ ref: string }>('/page/configure', { page, patch }),
		createResource: (input: CreateResourceInput) =>
			post<{ ref: string }>(
				'/resources',
				input as unknown as Record<string, unknown>,
			),
		addField: (resource: string, field: FieldSpec) =>
			post<{ path: string }>('/resource/fields', {
				resource,
				field,
			}),
		configureResource: (resource: string, patch: { routes?: string[] }) =>
			post<void>('/resource/configure', { resource, patch }),
		configureField: (path: string, patch: Partial<FieldAspects>) =>
			put<void>('/resource/fields', { path, patch }),
		removeField: (path: string) => remove<void>('/resource/fields', { path }),
		queryTemplates: () =>
			get<QueryTemplateDescriptor[]>('/query-templates'),
		dataSources: (responseShape?: string) =>
			get<DataSourceDescriptor[]>(
				responseShape
					? `/data-sources?responseShape=${encodeURIComponent(responseShape)}`
					: '/data-sources',
			),
		previewQuery: (query: AddQueryInput, args?: Record<string, unknown>) =>
			post<QueryPreview>('/query-preview', {
				query: query as unknown as Record<string, unknown>,
				args: args ?? {},
			}),
		addQuery: (page: string, input: AddQueryInput) =>
			post<{ query: string; route: string }>('/queries', {
				page,
				input,
			}),
		removeQuery: (ref: string) => remove<void>('/queries', { ref }),
	}
}
