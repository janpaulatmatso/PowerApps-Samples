/**
 * Minimal RFC 4180 CSV parser. Supports quoted fields with embedded delimiters,
 * line breaks and escaped quotes (""). The delimiter is detected from the first line,
 * so files saved by a Dutch Excel (;) and by an English Excel (,) both work.
 */
export function parseCsv(content: string, delimiter?: string): string[][] {
	const text = content.replace(/^\uFEFF/, "");
	const sep = delimiter ?? detectDelimiter(text);
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += c;
			}
		} else if (c === '"' && field === "") {
			inQuotes = true;
		} else if (c === sep) {
			row.push(field);
			field = "";
		} else if (c === "\r" || c === "\n") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else {
			field += c;
		}
	}
	if (field !== "" || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	// Ignore empty lines, which Excel often adds at the end of a file.
	return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** Returns the most frequent of ; , and tab outside quotes on the first line. */
export function detectDelimiter(text: string): string {
	const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
	let inQuotes = false;
	for (const c of text) {
		if (c === '"') inQuotes = !inQuotes;
		else if (!inQuotes && (c === "\n" || c === "\r")) break;
		else if (!inQuotes && c in counts) counts[c]++;
	}
	return Object.keys(counts).reduce((best, c) => (counts[c] > counts[best] ? c : best), ";");
}
