import * as React from "react";
import {
	Checkbox,
	DefaultButton,
	DetailsList,
	DetailsListLayoutMode,
	Dropdown,
	IColumn,
	IDropdownOption,
	MessageBar,
	MessageBarType,
	PrimaryButton,
	ProgressIndicator,
	SelectionMode,
	Stack,
	Text,
} from "@fluentui/react";
import { ListColumn, RowValues, Translate } from "../types";
import { parseCsv } from "../utils/csv";
import { formatValue, parseValue } from "../utils/values";
import { errorMessage } from "./Shared";

export interface CsvImportProps {
	t: Translate;
	locale: string;
	columns: ListColumn[];
	createRow: (values: RowValues) => Promise<string>;
	onImported: () => void;
}

interface PreviewRow {
	line: number;
	values: RowValues;
	errors: string[];
}

const NOT_MAPPED = -1;
const PREVIEW_ROWS = 50;

/** Uploads a CSV file: maps the CSV headers to the list columns, validates every row and creates the valid rows. */
export const CsvImport: React.FC<CsvImportProps> = ({ t, locale, columns, createRow, onImported }) => {
	const [fileName, setFileName] = React.useState<string>();
	const [headers, setHeaders] = React.useState<string[]>([]);
	const [data, setData] = React.useState<string[][]>([]);
	const [mapping, setMapping] = React.useState<Record<string, number>>({});
	const [skipInvalid, setSkipInvalid] = React.useState(true);
	const [progress, setProgress] = React.useState<number>();
	const [result, setResult] = React.useState<{ type: MessageBarType; text: string }>();
	const fileInput = React.useRef<HTMLInputElement>(null);

	const readFile = (file: File) => {
		setResult(undefined);
		const reader = new FileReader();
		reader.onload = () => {
			const rows = parseCsv(typeof reader.result === "string" ? reader.result : "");
			if (rows.length < 2) {
				setResult({ type: MessageBarType.error, text: t("CsvEmpty") });
				return;
			}
			const [headerRow, ...dataRows] = rows;
			setFileName(file.name);
			setHeaders(headerRow.map((h) => h.trim()));
			setData(dataRows);
			setMapping(autoMap(columns, headerRow));
		};
		reader.onerror = () => setResult({ type: MessageBarType.error, text: t("CsvReadError") });
		reader.readAsText(file);
	};

	const reset = () => {
		setFileName(undefined);
		setHeaders([]);
		setData([]);
		setMapping({});
		setProgress(undefined);
		if (fileInput.current) fileInput.current.value = "";
	};

	const preview: PreviewRow[] = React.useMemo(
		() =>
			data.map((cells, index) => {
				const values: RowValues = {};
				const errors: string[] = [];
				for (const column of columns) {
					const cellIndex = mapping[column.key] ?? NOT_MAPPED;
					const parsed = parseValue(column, cellIndex === NOT_MAPPED ? "" : cells[cellIndex]);
					values[column.key] = parsed.value;
					if (parsed.error) errors.push(`${column.name}: ${t(parsed.error)}`);
				}
				// Line numbers as shown in a text editor; line 1 is the header.
				return { line: index + 2, values, errors };
			}),
		[data, columns, mapping, t]
	);

	const invalidCount = preview.filter((r) => r.errors.length > 0).length;
	const toImport = preview.filter((r) => r.errors.length === 0);
	const canImport = toImport.length > 0 && (skipInvalid || invalidCount === 0) && progress === undefined;

	const startImport = async () => {
		setProgress(0);
		setResult(undefined);
		let imported = 0;
		try {
			for (const row of toImport) {
				await createRow(row.values);
				imported++;
				setProgress(imported / toImport.length);
			}
			reset();
			setResult({
				type: MessageBarType.success,
				text: t("ImportDone", imported, invalidCount),
			});
		} catch (e) {
			setProgress(undefined);
			setResult({ type: MessageBarType.error, text: t("ImportFailed", imported, errorMessage(e)) });
		}
		onImported();
	};

	const headerOptions: IDropdownOption[] = [
		{ key: NOT_MAPPED, text: t("NotImported") },
		...headers.map((h, i) => ({ key: i, text: h || `#${i + 1}` })),
	];

	const previewColumns: IColumn[] = [
		{ key: "line", name: t("Line"), fieldName: "line", minWidth: 40, maxWidth: 50 },
		...columns.map<IColumn>((c) => ({
			key: c.key,
			name: c.name,
			minWidth: 80,
			maxWidth: 200,
			isResizable: true,
			onRender: (row: PreviewRow) => formatValue(c, row.values[c.key], locale, t("Yes"), t("No")),
		})),
		{
			key: "errors",
			name: t("Errors"),
			minWidth: 150,
			isMultiline: true,
			onRender: (row: PreviewRow) => (
				<Text styles={{ root: { color: "#a4262c" } }}>{row.errors.join(" ")}</Text>
			),
		},
	];

	return (
		<Stack tokens={{ childrenGap: 12 }} styles={{ root: { paddingTop: 12 } }}>
			<Text>{t("CsvHelp")}</Text>
			{result && (
				<MessageBar messageBarType={result.type} isMultiline onDismiss={() => setResult(undefined)}>
					{result.text}
				</MessageBar>
			)}
			<Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
				<input
					ref={fileInput}
					type="file"
					accept=".csv,.txt,text/csv"
					style={{ display: "none" }}
					onChange={(e) => {
						const file = e.target.files?.[0];
						if (file) readFile(file);
					}}
				/>
				<DefaultButton
					iconProps={{ iconName: "Upload" }}
					text={t("ChooseFile")}
					disabled={progress !== undefined}
					onClick={() => fileInput.current?.click()}
				/>
				{fileName && <Text>{t("RowsInFile", fileName, data.length)}</Text>}
			</Stack>

			{fileName && (
				<>
					<Text variant="mediumPlus">{t("MapColumns")}</Text>
					<Stack horizontal wrap tokens={{ childrenGap: 12 }}>
						{columns.map((c) => (
							<Dropdown
								key={c.key}
								label={c.name}
								required={c.required}
								options={headerOptions}
								selectedKey={mapping[c.key] ?? NOT_MAPPED}
								onChange={(_, o) => o && setMapping({ ...mapping, [c.key]: o.key as number })}
								styles={{ root: { width: 200 } }}
							/>
						))}
					</Stack>

					<Text variant="mediumPlus">{t("Preview", Math.min(PREVIEW_ROWS, preview.length), preview.length)}</Text>
					<MessageBar messageBarType={invalidCount > 0 ? MessageBarType.warning : MessageBarType.success}>
						{t("ValidationSummary", toImport.length, invalidCount)}
					</MessageBar>
					<DetailsList
						items={preview.slice(0, PREVIEW_ROWS)}
						columns={previewColumns}
						selectionMode={SelectionMode.none}
						layoutMode={DetailsListLayoutMode.justified}
						compact
					/>
					{invalidCount > 0 && (
						<Checkbox
							label={t("SkipInvalid")}
							checked={skipInvalid}
							onChange={(_, v) => setSkipInvalid(!!v)}
						/>
					)}
					{progress !== undefined && (
						<ProgressIndicator label={t("Importing")} percentComplete={progress} />
					)}
					<Stack horizontal tokens={{ childrenGap: 8 }}>
						<PrimaryButton
							iconProps={{ iconName: "CloudUpload" }}
							text={t("ImportRows", toImport.length)}
							disabled={!canImport}
							onClick={() => void startImport()}
						/>
						<DefaultButton text={t("Cancel")} disabled={progress !== undefined} onClick={reset} />
					</Stack>
				</>
			)}
		</Stack>
	);
};

/** Maps each column to the CSV header with the same name, ignoring case and surrounding spaces. */
function autoMap(columns: ListColumn[], headers: string[]): Record<string, number> {
	const normalized = headers.map((h) => h.trim().toLowerCase());
	const mapping: Record<string, number> = {};
	for (const column of columns) {
		const byName = normalized.indexOf(column.name.trim().toLowerCase());
		mapping[column.key] = byName !== NOT_MAPPED ? byName : normalized.indexOf(column.key);
	}
	return mapping;
}
