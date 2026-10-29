import type { BlockDraft, ComponentPreview } from '../runtime/types'


export const LIVE_STATES = [
	{ label: 'Live', value: 'live' },
	{ label: 'Pause', value: 'pause' },
]

/** The props Node takes. */
export interface Props {
	block: BlockDraft
	path: string
	preview?: ComponentPreview
}
