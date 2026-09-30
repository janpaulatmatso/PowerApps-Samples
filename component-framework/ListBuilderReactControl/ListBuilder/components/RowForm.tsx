import * as React from "react";
import {
	DatePicker,
	DayOfWeek,
	DefaultButton,
	Dropdown,
	IDropdownOption,
	MessageBar,
	MessageBarType,
	PrimaryButton,
	Stack,
	TextField,
	Toggle,
} from "@fluentui/react";
import { CellValue, ColumnType, ListColumn, RowValues, Translate } from "../types";
import { formatDateInput, fromIsoDate, parseDate, parseValue, toInputText, toIsoDate } from "../utils/values";

export interface RowFormProps {
	t: Translate;
	locale: string;
	columns: ListColumn[];
	/** Values of the row being edited, or undefined for a new row. */
	initialValues?: RowValues;
	onSubmit: (values: RowValues) => Promise<void>;
	onCancel?: () => void;
}

/** Field state: text for text based inputs, Date for dates, boolean for yes/no and the option for choices. */
type FieldValue = string | boolean | Date | undefined;

/** An input form with a field for each column of the list, matching the data type of the column. */
export const RowForm: React.FC<RowFormProps> = ({ t, locale, columns, initialValues, onSubmit, onCancel }) => {
	const toFields = React.useCallback(
		(values?: RowValues) => Object.fromEntries(columns.map((c) => [c.key, toFieldValue(c, values?.[c.key], locale)])),
		[columns, locale]
	);
	const [fields, setFields] = React.useState<Record<string, FieldValue>>(() => toFields(initialValues));
	const [errors, setErrors] = React.useState<Record<string, string>>({});
	const [saving, setSaving] = React.useState(false);
	const [saved, setSaved] = React.useState(false);

	React.useEffect(() => {
		setFields(toFields(initialValues));
		setErrors({});
	}, [initialValues, toFields]);

	const setField = (key: string, value: FieldValue) => {
		setFields((f) => ({ ...f, [key]: value }));
		setErrors((e) => {
			const { [key]: _, ...rest } = e;
			return rest;
		});
		setSaved(false);
	};

	const submit = () => {
		const values: RowValues = {};
		const newErrors: Record<string, string> = {};
		for (const column of columns) {
			const result = parseValue(column, toText(column, fields[column.key]));
			values[column.key] = result.value;
			if (result.error) newErrors[column.key] = t(result.error);
		}
		setErrors(newErrors);
		if (Object.keys(newErrors).length > 0) return;

		setSaving(true);
		onSubmit(values)
			.then(() => {
				setSaving(false);
				if (!initialValues) {
					// Clear the form so the next row can be entered right away.
					setFields(toFields(undefined));
					setSaved(true);
				}
				return undefined;
			})
			.catch(() => setSaving(false));
	};

	return (
		<Stack tokens={{ childrenGap: 12 }} styles={{ root: { maxWidth: 600 } }}>
			{saved && (
				<MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSaved(false)}>
					{t("RowSaved")}
				</MessageBar>
			)}
			{columns.map((column) => (
				<Field
					key={column.key}
					t={t}
					column={column}
					value={fields[column.key]}
					error={errors[column.key]}
					onChange={(v) => setField(column.key, v)}
				/>
			))}
			<Stack horizontal tokens={{ childrenGap: 8 }}>
				<PrimaryButton text={saving ? t("Saving") : t("Save")} disabled={saving} onClick={submit} />
				{onCancel && <DefaultButton text={t("Cancel")} disabled={saving} onClick={onCancel} />}
			</Stack>
		</Stack>
	);
};

interface FieldProps {
	t: Translate;
	column: ListColumn;
	value: FieldValue;
	error?: string;
	onChange: (value: FieldValue) => void;
}

const Field: React.FC<FieldProps> = ({ t, column, value, error, onChange }) => {
	const label = column.name;
	switch (column.type) {
		case ColumnType.YesNo:
			return (
				<Toggle
					label={label}
					onText={t("Yes")}
					offText={t("No")}
					checked={value === true}
					onChange={(_, checked) => onChange(!!checked)}
				/>
			);

		case ColumnType.Choice: {
			const options: IDropdownOption[] = column.options.map((o) => ({ key: o, text: o }));
			if (!column.required) options.unshift({ key: "", text: t("NoValue") });
			return (
				<Dropdown
					label={label}
					required={column.required}
					options={options}
					selectedKey={typeof value === "string" ? value : ""}
					placeholder={t("SelectOption")}
					errorMessage={error}
					onChange={(_, o) => onChange(o ? String(o.key) : undefined)}
				/>
			);
		}

		case ColumnType.Date:
			return (
				<DatePicker
					label={label}
					isRequired={column.required}
					allowTextInput
					firstDayOfWeek={DayOfWeek.Monday}
					placeholder={t("DatePlaceholder")}
					value={value instanceof Date ? value : undefined}
					formatDate={formatDateInput}
					parseDateFromString={(text) => {
						const iso = parseDate(text);
						return iso ? (fromIsoDate(iso) ?? null) : null;
					}}
					onSelectDate={(d) => onChange(d ?? undefined)}
					textField={{ errorMessage: error }}
				/>
			);

		default:
			return (
				<TextField
					label={label}
					required={column.required}
					multiline={column.type === ColumnType.MultilineText}
					autoAdjustHeight={column.type === ColumnType.MultilineText}
					inputMode={
						column.type === ColumnType.WholeNumber
							? "numeric"
							: column.type === ColumnType.Decimal
								? "decimal"
								: undefined
					}
					value={typeof value === "string" ? value : ""}
					errorMessage={error}
					onChange={(_, v) => onChange(v ?? "")}
				/>
			);
	}
};

function toFieldValue(column: ListColumn, value: CellValue | undefined, locale: string): FieldValue {
	switch (column.type) {
		case ColumnType.YesNo:
			return value === true;
		case ColumnType.Date:
			return typeof value === "string" ? fromIsoDate(value) : undefined;
		case ColumnType.Choice:
			return typeof value === "string" ? value : undefined;
		default:
			return toInputText(column, value, locale);
	}
}

/** Converts a field value back to text, so all values are validated by parseValue. */
function toText(column: ListColumn, value: FieldValue): string {
	if (value instanceof Date) return toIsoDate(value);
	if (typeof value === "boolean") return value ? "true" : "false";
	return value ?? "";
}
