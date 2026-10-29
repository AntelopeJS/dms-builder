import { useDmsState } from '#dms/frontend-module'
import { useBuilderApi } from './api'
import { SESSION_STATE_KEY } from './constants'
import {
	emptySession,
	type BuilderController,
	type BuilderSession,
} from './session-model'
import { createDerived } from './session-derived'
import { createLoaders } from './session-loaders'
import { createHistory } from './session-history'
import { createNavigation } from './session-navigation'
import { createBlocks } from './session-blocks'
import { createLifecycle } from './session-lifecycle'
import { createSite } from './session-site'

export type { Workspace, LeftTab, PageLayout, TableTab, BuilderSession, BuilderController } from './session-model'

export function useBuilder(): BuilderController {
	const session = useDmsState<BuilderSession>(SESSION_STATE_KEY, emptySession)
	const api = useBuilderApi()
	const core = { session, api }
	const derived = createDerived({ ...core })
	const loaders = createLoaders({ ...core, ...derived })
	const history = createHistory({ ...core, ...derived, ...loaders })
	const navigation = createNavigation({ ...core, ...derived, ...loaders, ...history })
	const blocks = createBlocks({ ...core, ...derived, ...loaders, ...history, ...navigation })
	const lifecycle = createLifecycle({ ...core, ...derived, ...loaders, ...history, ...navigation, ...blocks })
	const site = createSite({ ...core, ...derived, ...loaders, ...history, ...navigation, ...blocks, ...lifecycle })
	const { dirty, blockCount, problems, gaps, selected, selectedDescriptor, paletteTarget, open, close, reload, followRoute, resolvePending, leave, resolveClose, stayOpen, select, setView, setWorkspace, openTable, back, openRegion, openMenu, closeMenu, mutate, addBlock, remove, duplicate, move, nudge, patchConfig, setDraftQuery, removeDraftQuery, previewQuery, patchMeta, setController, setSlot, patchPage, setLive, setDraft, undo, redo, cancel, save, notify, unsaved, readersOf, accessWarnings, pagePermission, viewedAs, veils, setViewAs, loadAccess, revert, stayOnPage, applyLayout, addNextTo, grouped, restoreAnyway, dropRestored, keepMine, loadResourceFields, loadResource, loadQueryTemplates, createResource, deleteResource, addField, configureCategory, moveCategory, movePage, loadSiteTree, createPage, createCategory, deletePage, deleteCategory, configureField, configureResource, removeField, beginDrag, endDrag, aimAt, aimAtPage, aimInto, regionOf, drop, dropAt, hover, refusalAt } = { ...derived, ...loaders, ...history, ...navigation, ...blocks, ...lifecycle, ...site }

	return {
		session,
		dirty,
		blockCount,
		problems,
		gaps,
		selected,
		selectedDescriptor,
		paletteTarget,
		open,
		close,
		reload,
		followRoute,
		resolvePending,
		leave,
		resolveClose,
		stayOpen,
		select,
		setView,
		setWorkspace,
		openTable,
		back,
		openRegion,
		openMenu,
		closeMenu,
		mutate,
		addBlock,
		remove,
		duplicate,
		move,
		nudge,
		patchConfig,
		setDraftQuery,
		removeDraftQuery,
		previewQuery,
		patchMeta,
		setController,
		setSlot,
		patchPage,
		setLive,
		setDraft,
		undo,
		redo,
		cancel,
		save,
		notify,
		unsaved,
		readersOf,
		accessWarnings,
		pagePermission,
		viewedAs,
		veils,
		setViewAs,
		loadAccess,
		revert,
		stayOnPage,
		applyLayout,
		addNextTo,
		grouped,
		restoreAnyway,
		dropRestored,
		keepMine,
		loadResourceFields,
		loadResource,
		loadQueryTemplates,
		createResource,
		deleteResource,
		addField,
		configureCategory,
		moveCategory,
		movePage,
		loadSiteTree,
		createPage,
		createCategory,
		deletePage,
		deleteCategory,
		configureField,
		configureResource,
		removeField,
		beginDrag,
		endDrag,
		aimAt,
		aimAtPage,
		aimInto,
		regionOf,
		drop,
		dropAt,
		hover,
		refusalAt,
	}
}
