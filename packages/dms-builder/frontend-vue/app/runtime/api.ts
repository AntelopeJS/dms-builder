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
 * The typed client over the module's HTTP API. Reads answer with their value,
 * writes with an `OpResult` the caller branches on.
 */
export function useBuilderApi() {
	const { $authFetch } = useAuthFetch()

	function get<T>(path: string, query?: Record<string, string>): Promise<T> {
		return $authFetch<T>(`${API_PREFIX}${path}`, { method: 'GET', query })
	}

	function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
		return $authFetch<T>(`${API_PREFIX}${path}`, { method: 'POST', body })
	}

	function put<T>(path: string, body: Record<string, unknown>): Promise<T> {
		return $authFetch<T>(`${API_PREFIX}${path}`, { method: 'PUT', body })
	}

	function remove<T>(path: string, query: Record<string, string>): Promise<T> {
		return $authFetch<T>(`${API_PREFIX}${path}`, { method: 'DELETE', query })
	}

	return {
		catalog: () => get<BlockCatalog>('/catalog'),
		pages: () => get<PageSummary[]>('/pages'),
		categories: () => get<CategorySummary[]>('/categories'),
		createPage: (input: CreatePageInput) =>
			post<OpResult<{ ref: string; filepath: string }>>(
				'/pages',
				input as unknown as Record<string, unknown>,
			),
		deletePage: (ref: string) => remove<OpResult<void>>('/page', { ref }),
		createCategory: (input: CreateCategoryInput) =>
			post<OpResult<{ ref: string }>>(
				'/categories',
				input as unknown as Record<string, unknown>,
			),
		deleteCategory: (ref: string) =>
			remove<OpResult<void>>('/category', { ref }),
		structure: (ref: string) =>
			get<OpResult<PageStructure>>('/page', { ref }),
		resources: () => get<ResourceSummary[]>('/resources'),
		resource: (ref: string) =>
			get<OpResult<ResourceStructure>>('/resource', { ref }),
		preview: (page: string, draft: PageDraft) =>
			post<OpResult<PageLayoutPreview>>('/page/preview', { page, draft }),
		save: (body: SaveBody) =>
			post<OpResult<{ version: string }>>(
				'/page/blocks',
				body as unknown as Record<string, unknown>,
			),
		refresh: () => post<{ ok: boolean }>('/refresh', {}),
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
		deleteResource: (ref: string) => remove<OpResult<void>>('/resource', { ref }),
		configureCategory: (category: string, patch: Record<string, unknown>) =>
			put<OpResult<void>>('/category', { category, patch }),
		configureQuery: (query: string, patch: Record<string, unknown>) =>
			put<OpResult<void>>('/queries', { query, patch }),
		// The ref comes back because a patch can change it: a page's category
		// decides its route.
		configurePage: (page: string, patch: Record<string, unknown>) =>
			post<OpResult<{ ref: string }>>('/page/configure', { page, patch }),
		createResource: (input: CreateResourceInput) =>
			post<OpResult<{ ref: string }>>(
				'/resources',
				input as unknown as Record<string, unknown>,
			),
		addField: (resource: string, field: FieldSpec) =>
			post<OpResult<{ path: string }>>('/resource/fields', {
				resource,
				field,
			}),
		configureResource: (resource: string, patch: { routes?: string[] }) =>
			post<OpResult<void>>('/resource/configure', { resource, patch }),
		configureField: (path: string, patch: Partial<FieldAspects>) =>
			put<OpResult<void>>('/resource/fields', { path, patch }),
		removeField: (path: string) =>
			remove<OpResult<void>>('/resource/fields', { path }),
		queryTemplates: () =>
			get<QueryTemplateDescriptor[]>('/query-templates'),
		addQuery: (page: string, input: AddQueryInput) =>
			post<OpResult<{ query: string; route: string }>>('/queries', {
				page,
				input,
			}),
		removeQuery: (ref: string) => remove<OpResult<void>>('/queries', { ref }),
	}
}
