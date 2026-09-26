import { pathForPointer } from './draft'
import type {
	BuilderError,
	PageDraft,
	TypecheckError,
	ValidationIssue,
} from './types'

/** The same refusal reported once, however many times it came back. */
function unique(messages: string[]): string[] {
	return [...new Set(messages)]
}

/**
 * One refused rule, in terms of the page the user is looking at.
 *
 * The module words the rule itself well enough to show as it stands; what it
 * prefixes is a JSON pointer into the draft it was sent, which addresses blocks
 * by index. The draft turns that index back into the block's own name, and the
 * pointer is dropped.
 */
export function describeIssue(
	issue: ValidationIssue,
	draft: PageDraft | null,
): string {
	const path = draft ? pathForPointer(draft, issue.pointer) : undefined
	return path ? `${path}: ${issue.message}` : issue.message
}

/** Every refused rule of one answer, in the order the module reported them. */
export function describeIssues(
	issues: ValidationIssue[],
	draft: PageDraft | null,
): string {
	return unique(issues.map((issue) => describeIssue(issue, draft))).join(' · ')
}

const MISSING_PROPERTY = /Property '([^']+)' is missing in type/
const NOT_ASSIGNABLE = /Type '(.+)' is not assignable to type '([^']+)'/

/**
 * What a compiler complaint about the page the engine wrote means for the
 * settings it wrote it from.
 *
 * The engine typechecks its own output, so a page that does not build comes
 * back in the terms of that output: a line number in a file nobody opened, and
 * the name of a type. The one thing such a message does carry that an author can
 * act on is the name of the setting, so that is what is kept.
 */
function describeDiagnostic(entry: TypecheckError): string {
	const missing = MISSING_PROPERTY.exec(entry.message)
	if (missing) {
		return `a required setting is missing (${missing[1]})`
	}
	const mismatch = NOT_ASSIGNABLE.exec(entry.message)
	if (mismatch) {
		return `a setting holds the wrong kind of value (expected ${mismatch[2]})`
	}
	return entry.message.replace(/\.$/, '')
}

/**
 * The refusal as the module worded it, for whoever wants it.
 *
 * Kept out of the banner and behind a disclosure: it addresses generated source
 * and a wire format, which is the developer's half of the answer, not the
 * author's.
 */
export function errorDetail(error: BuilderError): string[] {
	if (error.code === 'typecheck_failed' && 'diagnostics' in error) {
		return unique(
			error.diagnostics.map(
				(entry) => `${entry.file}:${entry.line} — ${entry.message}`,
			),
		)
	}
	if (error.code === 'invalid_config' && 'issues' in error) {
		return unique(
			error.issues.map((issue) => `${issue.pointer} — ${issue.message}`),
		)
	}
	return []
}

/**
 * What a refusal reads as in the banner.
 *
 * The draft is what an `invalid_config` is read against; without one the rules
 * are still shown, just without the names of the blocks they are about.
 */
export function describeError(
	error: BuilderError,
	draft: PageDraft | null,
): string {
	const messages: Record<string, () => string> = {
		not_found: () => 'This page is not one the builder can edit.',
		stale: () =>
			'The page changed on disk since it was opened. Reload it to keep going.',
		invalid_config: () =>
			'issues' in error && error.issues.length > 0
				? `This page cannot be built as it stands. ${describeIssues(error.issues, draft)}`
				: 'Invalid configuration.',
		typecheck_failed: () =>
			'diagnostics' in error && error.diagnostics.length > 0
				? `This page cannot be built as it stands: ${unique(
						error.diagnostics.map(describeDiagnostic),
					).join('; ')}.`
				: 'This page cannot be built as it stands.',
		unsupported: () => ('detail' in error ? error.detail : 'Unsupported.'),
		duplicate_name: () =>
			'name' in error
				? `The name "${error.name}" is already taken.`
				: 'Duplicate name.',
		opaque_target: () => 'That block cannot be rewritten by the builder.',
		referential_integrity: () => 'Something still depends on this.',
	}
	return (messages[error.code] ?? (() => 'The operation failed.'))()
}
