import {
  defineDmsPlugin,
  useDmsRoute,
  useDmsState,
} from '#dms/frontend-module'
import {
  ACTION_ICON,
  ACTION_ID,
  ACTION_LABEL,
  ACTION_ORDER,
  APP_OVERLAYS_STATE_KEY,
  HEADER_ACTIONS_STATE_KEY,
  OVERLAY_COMPONENT_NAME,
} from '../runtime/constants'
import { useBuilder } from '../runtime/session'
import { takeThemeSave } from '../runtime/theme-reload'

// Our view of the shared header-action shape the DMS core renders. Declared
// locally so this layer has no build-time dependency on the core layer; the
// state key and these fields are the whole contract.
interface HeaderAction {
  id: string
  icon: string
  label: string
  onSelect: () => void
  order?: number
  isActive?: () => boolean
}

function registerOverlay(): void {
  const overlays = useDmsState<string[]>(APP_OVERLAYS_STATE_KEY, () => [])
  if (overlays.value.includes(OVERLAY_COMPONENT_NAME)) {
    return
  }
  overlays.value = [...overlays.value, OVERLAY_COMPONENT_NAME]
}

function registerAction(onSelect: () => void, isActive: () => boolean): void {
  const actions = useDmsState<HeaderAction[]>(HEADER_ACTIONS_STATE_KEY, () => [])
  if (actions.value.some((action) => action.id === ACTION_ID)) {
    return
  }
  actions.value = [
    ...actions.value,
    {
      id: ACTION_ID,
      icon: ACTION_ICON,
      label: ACTION_LABEL,
      order: ACTION_ORDER,
      onSelect,
      isActive,
    },
  ]
}

export default defineDmsPlugin((app) => {
  // Whether the builder is available at all is settled in `dms.frontend.ts`,
  // from the option the backend publishes: the Vite build mode of the frontend
  // says nothing about whether the backend runs in development.
  const builder = useBuilder()
  const route = useDmsRoute()
  // The first theme save imports the stylesheet from the layer's entry, and
  // the page reloads with the builder: the editor opens again on the theme
  // once the page is mounted, and says the save went through.
  app.hook('app:mounted', async () => {
    const saved = takeThemeSave()
    if (!saved || saved.route !== route.path) {
      return
    }
    await builder.open(route.path)
    builder.setWorkspace('theme')
    builder.notify(saved.message)
  })
  registerOverlay()
  registerAction(
    () => {
      if (builder.session.value.active) {
        // The same button opens and closes it, so closing it is a way out like
        // any other: it asks before dropping a draft nobody saved.
        builder.leave()
        return
      }
      void builder.open(route.path)
    },
    () => builder.session.value.active,
  )
})
