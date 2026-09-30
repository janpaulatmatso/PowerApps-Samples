import { CellValue, ColumnType, ListColumn, RowValues } from "../types";

/** Resource keys of the validation errors, so the UI can translate them. */
export type ValueError =
	| "Error_Required"
	| "Error_WholeNumber"
	| "Error_Decimal"
	| "Error_Date"
	| "Error_YesNo"
	| "Error_Choice";

export interface ParseResult {
	value: CellValue;
	error?: ValueError;
}

const YES_VALUES = ["ja", "j", "yes", "y", "true", "waar", "1", "x"];
const NO_VALUES = ["nee", "n", "no", "false", "onwaar", "0"];

/**
 * Converts text entered in a form field or read from a CSV file into the stored value of a column.
 * Accepts both Dutch and English notations (1.234,56 and 1,234.56, dd-mm-yyyy and yyyy-mm-dd, ja/nee and yes/no).
 */
export function parseValue(column: ListColumn, input: string | null | undefined): ParseResult {
	const text = (input ?? "").trim();
	if (text === "") {
		return column.required ? { value: null, error: "Error_Required" } : { value: null };
	}

	switch (column.type) {
		case ColumnType.Text:
		case ColumnType.MultilineText:
			return { value: column.type === ColumnType.Text ? text : (input ?? "") };

		case ColumnType.WholeNumber: {
			const n = parseNumber(text);
			return n !== null && Number.isInteger(n) ? { value: n } : { value: null, error: "Error_WholeNumber" };
		}

		case ColumnType.Decimal: {
			const n = parseNumber(text);
			return n !== null ? { value: n } : { value: null, error: "Error_Decimal" };
		}

		case ColumnType.Date: {
			const d = parseDate(text);
			return d !== null ? { value: d } : { value: null, error: "Error_Date" };
		}

		case ColumnType.YesNo: {
			const lower = text.toLowerCase();
			if (YES_VALUES.includes(lower)) return { value: true };
			if (NO_VALUES.includes(lower)) return { value: false };
			return { value: null, error: "Error_YesNo" };
		}

		case ColumnType.Choice: {
			const match = column.options.find((o) => o.toLowerCase() === text.toLowerCase());
			return match !== undefined ? { value: match } : { value: null, error: "Error_Choice" };
		}

		default:
			return { value: text };
	}
}

/**
 * Parses a number written with either a decimal comma or a decimal point, with optional
 * thousands separators. A single separator is always read as the decimal separator, so
 * 1,5 and 1.5 both become 1.5 while 1.234,56 and 1,234.56 both become 1234.56.
 * Returns null when the text isn't a number.
 */
export function parseNumber(text: string): number | null {
	let s = text.replace(/[\s\u00a0']/g, "");
	if (!/^[+-]?[\d.,]+$/.test(s) || !/\d/.test(s)) {
		return null;
	}
	const lastComma = s.lastIndexOf(",");
	const lastDot = s.lastIndexOf(".");
	const commas = s.split(",").length - 1;
	const dots = s.split(".").length - 1;

	if (commas > 0 && dots > 0) {
		// The separator that comes last is the decimal separator.
		s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
	} else if (commas > 1) {
		if (!isThousandsGroup(s, ",")) return null;
		s = s.replace(/,/g, "");
	} else if (commas === 1) {
		s = s.replace(",", ".");
	} else if (dots > 1) {
		if (!isThousandsGroup(s, ".")) return null;
		s = s.replace(/\./g, "");
	}

	if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) {
		return null;
	}
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}

/** True when the separator is only used to group thousands, like 1.234.567 or 1,234,567. */
function isThousandsGroup(s: string, separator: "," | "."): boolean {
	const parts = s.replace(/^[+-]/, "").split(separator);
	return /^\d{1,3}$/.test(parts[0]) && parts.slice(1).every((p) => /^\d{3}$/.test(p));
}

/** Parses yyyy-mm-dd, dd-mm-yyyy, dd/mm/yyyy or dd.mm.yyyy into an ISO date string (yyyy-mm-dd). */
export function parseDate(text: string): string | null {
	const s = text.trim();
	let year: number, month: number, day: number;

	let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
	if (m) {
		year = +m[1];
		month = +m[2];
		day = +m[3];
	} else {
		m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
		if (!m) {
			return null;
		}
		day = +m[1];
		month = +m[2];
		year = +m[3];
	}

	const date = new Date(Date.UTC(year, month - 1, day));
	if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
		return null;
	}
	return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

/** Formats a date as yyyy-mm-dd using its local calendar date. */
export function toIsoDate(date: Date): string {
	return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Converts an ISO date string (yyyy-mm-dd) into a local Date at midnight. */
export function fromIsoDate(value: string): Date | undefined {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	return m ? new Date(+m[1], +m[2] - 1, +m[3]) : undefined;
}

/** Formats a date as dd-mm-yyyy, the notation used in the date pickers of this control. */
export function formatDateInput(date: Date | null | undefined): string {
	return date ? `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}` : "";
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/** Formats a stored value for display in a grid. */
export function formatValue(
	column: ListColumn,
	value: CellValue | undefined,
	locale: string,
	yesText: string,
	noText: string
): string {
	if (value === null || value === undefined || value === "") {
		return "";
	}
	switch (column.type) {
		case ColumnType.WholeNumber:
		case ColumnType.Decimal:
			return typeof value === "number"
				? value.toLocaleString(locale, { maximumFractionDigits: 10 })
				: String(value);
		case ColumnType.Date: {
			const d = typeof value === "string" ? fromIsoDate(value) : undefined;
			return d ? d.toLocaleDateString(locale) : String(value);
		}
		case ColumnType.YesNo:
			return value === true ? yesText : value === false ? noText : String(value);
		default:
			return String(value);
	}
}

/** Formats a stored value as editable text (the inverse of parseValue for text based inputs). */
export function toInputText(column: ListColumn, value: CellValue | undefined, locale: string): string {
	if (value === null || value === undefined) {
		return "";
	}
	if (typeof value === "number") {
		return value.toLocaleString(locale, { maximumFractionDigits: 10, useGrouping: false });
	}
	return String(value);
}

/** Short text that identifies a row, stored in the primary name column of sample_lijstregel. */
export function summarizeRow(values: RowValues, columns: ListColumn[], maxLength = 100): string {
	const parts: string[] = [];
	for (const column of columns) {
		const v = values[column.key];
		if (v !== null && v !== undefined && v !== "") {
			parts.push(String(v));
		}
		if (parts.length === 3) break;
	}
	const text = parts.join(" | ").replace(/\s+/g, " ");
	return text.length > maxLength ? `${text.substring(0, maxLength - 1)}…` : text;
}

/** Creates a key for a new column from its name that doesn't collide with existing keys. */
export function createColumnKey(name: string, existingKeys: string[]): string {
	const base =
		name
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "")
			.substring(0, 40) || "kolom";
	let key = base;
	let i = 2;
	while (existingKeys.includes(key)) {
		key = `${base}_${i++}`;
	}
	return key;
}
