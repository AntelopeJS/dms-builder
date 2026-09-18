import {
  defineDmsPlugin,
  useDmsRoute as useRoute,
  useDmsState as useState,
} from '#dms-inertia/frontend-module'
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
  const overlays = useState<string[]>(APP_OVERLAYS_STATE_KEY, () => [])
  if (overlays.value.includes(OVERLAY_COMPONENT_NAME)) {
    return
  }
  overlays.value = [...overlays.value, OVERLAY_COMPONENT_NAME]
}

function registerAction(onSelect: () => void, isActive: () => boolean): void {
  const actions = useState<HeaderAction[]>(HEADER_ACTIONS_STATE_KEY, () => [])
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

export default defineDmsPlugin(() => {
  // Whether the builder is available at all is settled in `dms.frontend.ts`,
  // from the option the backend publishes: the Vite build mode of the frontend
  // says nothing about whether the backend runs in development.
  const builder = useBuilder()
  const route = useRoute()
  registerOverlay()
  registerAction(
    () => {
      if (builder.session.value.active) {
        builder.close()
        return
      }
      void builder.open(route.path)
    },
    () => builder.session.value.active,
  )
})
