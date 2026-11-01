/** What each rule decides, as the workspace says it beside a choice. */
const RULE_SENTENCES: Record<string, string> = {
	R1: 'The database reports this table cannot be read.',
	R2: 'No key: it can feed stats, not a page.',
	R3: 'It has no rows.',
	R4: "A framework's or a migration tool's table.",
	R5: 'It only links two other tables: for stats only.',
	R6: 'It has a key, rows and a column that names a row: a page.',
	R7: 'Other tables point at it but no column names a row: a page, its rows named by their key.',
	R8: 'Dated rows and nothing that names a row: events or a log, for stats only.',
	R9: 'Nothing in the data says what it holds.',
	L1: "A column named like a person's or a thing's name, then the column whose name best fits a row name, then the first such column.",
	L2: "From the database's comment when it is short, otherwise from the name.",
	F1: 'No column type can read it.',
	F2: 'Named like a secret.',
	F3: 'The first type the column can be read as.',
	F4: 'The database declares it points at a table with a page.',
	F5: 'Every value matches a row of the other table, though the database does not declare it.',
	FL: 'From what the data looks like.',
	D1: 'Every value of this text column is one of a few: a badge, one tone per value.',
	D2: 'A number named like an amount: shown as a price.',
	D3: "Named after the table it points at, in singular.",
	T1: 'Tabs on the column that tells a status.',
	W1: 'Read-only until you choose otherwise.',
	mapped: 'As it is saved now.',
}

export function ruleSentence(rule: string): string {
	return RULE_SENTENCES[rule] ?? rule
}
