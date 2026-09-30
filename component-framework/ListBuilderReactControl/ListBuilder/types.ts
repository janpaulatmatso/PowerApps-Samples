/**
 * Data types a user can choose for a list column.
 * The numeric values match the options of the sample_datatype choice column
 * that setup/Create-ListTables.ps1 creates on the sample_lijstkolom table.
 */
export enum ColumnType {
	Text = 727000000,
	MultilineText = 727000001,
	WholeNumber = 727000002,
	Decimal = 727000003,
	Date = 727000004,
	YesNo = 727000005,
	Choice = 727000006,
}

export const ALL_COLUMN_TYPES: ColumnType[] = [
	ColumnType.Text,
	ColumnType.MultilineText,
	ColumnType.WholeNumber,
	ColumnType.Decimal,
	ColumnType.Date,
	ColumnType.YesNo,
	ColumnType.Choice,
];

/** A user defined list (a row in sample_lijst). */
export interface ListDefinition {
	id?: string;
	name: string;
	description: string;
}

/** A column of a user defined list (a row in sample_lijstkolom). */
export interface ListColumn {
	id?: string;
	/** Stable key used to store the value in the JSON of a list row. Never changes after creation. */
	key: string;
	name: string;
	type: ColumnType;
	/** Allowed values when type is Choice. */
	options: string[];
	required: boolean;
	order: number;
}

/**
 * A stored cell value. Dates are stored as ISO date strings (yyyy-mm-dd),
 * choices as the option text and empty cells as null.
 */
export type CellValue = string | number | boolean | null;

export type RowValues = Record<string, CellValue>;

/** A data row of a user defined list (a row in sample_lijstregel). */
export interface ListRow {
	id?: string;
	values: RowValues;
}

/** Translates a resource key, replacing {0}, {1}, ... with the given arguments. */
export type Translate = (key: string, ...args: (string | number)[]) => string;
