/**
 * The routes a table's API serves.
 *
 * A table whose routes the module could not read says nothing about them, and
 * serves them all: the module writes every one unless told otherwise.
 */
import { TABLE_ROUTES } from './constants'
import type { ResourceStructure } from './types'

export type TableRoute = (typeof TABLE_ROUTES)[number]['key']

export function servedRoutes(table: ResourceStructure | undefined): string[] {
	return table?.routes ?? TABLE_ROUTES.map((entry) => entry.key)
}

export function serves(table: ResourceStructure | undefined, route: TableRoute): boolean {
	return servedRoutes(table).includes(route)
}

/** What a table serves once one more route is turned on, the others kept. */
export function servedWith(
	table: ResourceStructure | undefined,
	route: TableRoute,
): string[] {
	return [...new Set([...servedRoutes(table), route])]
}

/** What the API tab calls a route. */
export function routeLabel(route: TableRoute): string {
	return TABLE_ROUTES.find((entry) => entry.key === route)?.label ?? route
}
