import { computed, ref } from 'vue'
import {
	branchKind,
	branchOf,
	descriptorOf,
	fitsAsWell,
	heldBlockOptions,
	valueKind,
} from '../runtime/catalog'
import { mergePatch } from '../runtime/object'
import { fitsEditor, typedEditor } from '../runtime/typed-values'
import type { OptionSchema } from '../runtime/types'
import { BRANCH_NAMES, type Props } from './Option'
import type { useOptionPart1 } from './OptionPart1'

export function useOptionPart2(scope: { props: Readonly<Props> } & ReturnType<typeof useOptionPart1>) {
	const { props, advanced, objectValue, session, set, shown } = scope

	function setProperty(key: string, value: unknown): void {
		set(mergePatch(objectValue.value, { [key]: value, ...droppedWith(key, value) }))
	}

	/**
	 * What a new data type leaves no room for: a default of the old type's kind,
	 * which the field could not hold any more. One the new type has no input for
	 * is kept, since nothing says it no longer fits.
	 */
	function droppedWith(key: string, value: unknown): Record<string, undefined> {
		const properties = props.schema.properties ?? branchSchema.value?.properties ?? {}
		const dropped: Record<string, undefined> = {}
		for (const [other, schema] of Object.entries(properties)) {
			const editor = schema.ui?.typedBy === key ? typedEditor(value) : undefined
			const current = objectValue.value[other]
			if (editor && current !== undefined && !fitsEditor(current, editor)) {
				dropped[other] = undefined
			}
		}
		return dropped
	}

	/* ---- sentinels ---------------------------------------------------------- */

	const dataTypeValue = computed(
		() =>
			(props.modelValue ?? {}) as {
				$dataType?: string
				config?: Record<string, unknown>
			},
	)

	const dataTypeSchema = computed(
		() =>
			session.value.catalog?.dataTypes.find(
				(entry) => entry.id === dataTypeValue.value.$dataType,
			)?.config ?? {},
	)

	function setDataType(id: unknown): void {
		set({ $dataType: id, config: dataTypeValue.value.config ?? {} })
	}

	function setDataTypeConfig(key: string, value: unknown): void {
		set({
			$dataType: dataTypeValue.value.$dataType,
			config: mergePatch(dataTypeValue.value.config ?? {}, { [key]: value }),
		})
	}

	const blockValue = computed(
		() =>
			(
				(props.modelValue ?? {}) as {
					$block?: { type?: string; config?: Record<string, unknown> }
				}
			).$block ?? {},
	)

	const blockSchema = computed(
		() => descriptorOf(session.value.catalog, blockValue.value.type)?.config ?? {},
	)
	const blockOptions = computed(() =>
		heldBlockOptions(props.schema, blockSchema.value, advanced.value),
	)

	function setBlockType(type: unknown): void {
		set({ $block: { type, config: blockValue.value.config ?? {} } })
	}

	function setBlockConfig(key: string, value: unknown): void {
		patchBlockConfig({ [key]: value })
	}

	/**
	 * Several of the nested block's options at once — a data source writes its URL
	 * and the period it follows together. Left unhandled here, that patch never
	 * reached the block: the query was saved and the chart never pointed at it.
	 */
	function patchBlockConfig(patch: Record<string, unknown>): void {
		set({
			$block: {
				type: blockValue.value.type,
				config: mergePatch(blockValue.value.config ?? {}, patch),
			},
		})
	}

	/**
	 * What a branch of a union is called in the panel.
	 *
	 * A discriminated union names its own: the literal its tag carries is the word
	 * the author knows it by. A union of plain kinds has no such word, so the kind
	 * itself is the only honest name — “Text”, “Number” — rather than a rank that
	 * says nothing about what picking it would do.
	 */
	function branchLabel(branch: OptionSchema, index: number): string {
		const tag = props.schema.discriminator
		const tagged = tag ? branch.properties?.[tag]?.enum?.[0] : undefined
		if (tagged !== undefined) {
			return String(tagged)
		}
		return (
			branch.ui?.label ?? BRANCH_NAMES[String(branch.type)] ?? `Option ${index + 1}`
		)
	}

	/**
	 * The names the branches go by, told apart.
	 *
	 * Two branches of one kind that the block names neither of would both be
	 * called after that kind, and two tabs saying the same word read as one. The
	 * block's own names are the fix; numbering them is what keeps the panel honest
	 * until it has them.
	 */
	const branchLabels = computed(() => {
		const labels = (props.schema.oneOf ?? []).map(branchLabel)
		return labels.map((label, index) => {
			const same = labels.filter((other) => other === label)
			if (same.length < 2) {
				return label
			}
			const rank = labels.slice(0, index + 1).filter((other) => other === label).length
			return `${label} ${rank}`
		})
	})

	/**
	 * Which branch the panel is on.
	 *
	 * A tag answers it outright. Without one, the value itself does — its kind,
	 * then how much of a branch it fills in — and the branch the author last asked
	 * for settles what the value leaves open, which is the only record of a choice
	 * an untagged union leaves behind.
	 */
	const picked = ref<number | null>(null)
	const branches = computed(() => props.schema.oneOf ?? [])
	const branchIndex = computed(() => {
		const tag = props.schema.discriminator
		if (!tag) {
			// The branch that was asked for holds as long as nothing fits better: an
			// object half filled in fits every object branch alike, and snapping to the
			// first of them would undo the choice at the first keystroke.
			if (
				picked.value !== null &&
				fitsAsWell(branches.value, picked.value, props.modelValue)
			) {
				return picked.value
			}
			const found = branchOf(branches.value, props.modelValue)
			return found === -1 ? (picked.value ?? 0) : found
		}
		const current = objectValue.value[tag]
		const found = props.schema.oneOf?.findIndex(
			(branch) => branch.properties?.[tag]?.enum?.[0] === current,
		)
		return found === undefined || found < 0 ? 0 : found
	})

	const branchSchema = computed(() => (props.schema.oneOf ?? [])[branchIndex.value])
	const branchProperties = computed(() =>
		Object.entries(branchSchema.value?.properties ?? {}).filter(
			([key, nested]) => key !== props.schema.discriminator && shown(nested),
		),
	)
	/**
	 * A branch that is a plain kind is edited as the option itself, so it inherits
	 * whether the option had to be filled in at all: the branch says nothing about
	 * that, and marking it required would contradict the union above it.
	 */
	const branchValueSchema = computed(() =>
		branchSchema.value
			? { ...branchSchema.value, optional: props.schema.optional }
			: undefined,
	)

	function selectBranch(index: unknown): void {
		const at = Number(index)
		const branch = props.schema.oneOf?.[at]
		if (!branch) {
			return
		}
		const tag = props.schema.discriminator
		if (tag) {
			set({ [tag]: branch.properties?.[tag]?.enum?.[0] })
			return
		}
		picked.value = at
		// A value of another kind is not one this branch can carry, and leaving it
		// would show an editor for one thing while the page holds another.
		if (branchKind(branch) !== valueKind(props.modelValue)) {
			set(undefined)
			return
		}
		if (!branch.properties) {
			return
		}
		// Between branches of the same kind, what they share is worth keeping and
		// what only the branch left behind knows is not: a property of its own left
		// on the value is exactly what would pull the panel back to it.
		const known = new Set(Object.keys(branch.properties))
		const kept = Object.fromEntries(
			Object.entries(objectValue.value).filter(([key]) => known.has(key)),
		)
		if (Object.keys(kept).length !== Object.keys(objectValue.value).length) {
			set(kept)
		}
	}

	const jsonText = computed(() =>
		props.modelValue === undefined
			? ''
			: JSON.stringify(props.modelValue, null, 2),
	)

	function setJson(text: string): void {
		if (!text.trim()) {
			set(undefined)
			return
		}
		try {
			set(JSON.parse(text))
		} catch {
			/* leave the value alone until the text parses */
		}
	}

	const nestedProperties = computed(() =>
		Object.entries(props.schema.properties ?? {}).filter(([, schema]) =>
			shown(schema),
		),
	)
	return {
		setProperty,
		droppedWith,
		dataTypeValue,
		dataTypeSchema,
		setDataType,
		setDataTypeConfig,
		blockValue,
		blockSchema,
		blockOptions,
		setBlockType,
		setBlockConfig,
		patchBlockConfig,
		branchLabel,
		branchLabels,
		picked,
		branches,
		branchIndex,
		branchSchema,
		branchProperties,
		branchValueSchema,
		selectBranch,
		jsonText,
		setJson,
		nestedProperties,
	}
}
