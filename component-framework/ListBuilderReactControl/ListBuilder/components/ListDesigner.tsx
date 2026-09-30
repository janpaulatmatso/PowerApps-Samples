import * as React from "react";
import {
	Checkbox,
	DefaultButton,
	Dropdown,
	IconButton,
	IDropdownOption,
	MessageBar,
	MessageBarType,
	PrimaryButton,
	Separator,
	Stack,
	Text,
	TextField,
} from "@fluentui/react";
import { IListService } from "../services/IListService";
import { ALL_COLUMN_TYPES, ColumnType, ListColumn, ListDefinition, Translate } from "../types";
import { createColumnKey } from "../utils/values";
import { ErrorBar, Loading, errorMessage } from "./Shared";

export interface ListDesignerProps {
	service: IListService;
	t: Translate;
	/** The list to edit. A new list is created when undefined. */
	listId?: string;
	/** On the form of the list, the form edits the name and description; only the columns are shown. */
	embedded?: boolean;
	onSaved: (listId: string) => void;
	onCancel: () => void;
}

/** A column while it is being edited. Choice options are edited as text, one option per line. */
interface DraftColumn extends ListColumn {
	uiKey: string;
	optionsText: string;
}

let uiKeyCounter = 0;
const newUiKey = () => `c${++uiKeyCounter}`;

/** Lets the user set the name and description of a list and define its columns and their data types. */
export const ListDesigner: React.FC<ListDesignerProps> = ({ service, t, listId, embedded, onSaved, onCancel }) => {
	const [list, setList] = React.useState<ListDefinition>({ name: "", description: "" });
	const [columns, setColumns] = React.useState<DraftColumn[]>();
	const [hasRows, setHasRows] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [submitted, setSubmitted] = React.useState(false);
	const [error, setError] = React.useState<string>();

	React.useEffect(() => {
		if (!listId) {
			setColumns([newColumn(0)]);
			return;
		}
		Promise.all([service.getList(listId), service.getColumns(listId), service.hasRows(listId)])
			.then(([l, c, r]) => {
				setList(l);
				setColumns(c.map((col) => ({ ...col, uiKey: newUiKey(), optionsText: col.options.join("\n") })));
				setHasRows(r);
				return undefined;
			})
			.catch((e) => {
				setColumns([]);
				setError(errorMessage(e));
			});
	}, [service, listId]);

	if (!columns) {
		return <Loading t={t} />;
	}

	const typeOptions: IDropdownOption[] = ALL_COLUMN_TYPES.map((type) => ({
		key: type,
		text: t(`Type_${ColumnType[type]}`),
	}));

	const update = (uiKey: string, changes: Partial<DraftColumn>) =>
		setColumns(columns.map((c) => (c.uiKey === uiKey ? { ...c, ...changes } : c)));

	const move = (index: number, delta: number) => {
		const copy = [...columns];
		const [item] = copy.splice(index, 1);
		copy.splice(index + delta, 0, item);
		setColumns(copy);
	};

	const nameError = submitted && !embedded && !list.name.trim() ? t("Error_Required") : undefined;
	const columnError = (column: DraftColumn): string | undefined => {
		if (!submitted) return undefined;
		const name = column.name.trim().toLowerCase();
		if (!name) return t("Error_Required");
		if (columns.filter((c) => c.name.trim().toLowerCase() === name).length > 1) return t("Error_DuplicateColumn");
		return undefined;
	};
	const optionsError = (column: DraftColumn): string | undefined =>
		submitted && column.type === ColumnType.Choice && splitOptions(column.optionsText).length === 0
			? t("Error_NoOptions")
			: undefined;

	const save = () => {
		setSubmitted(true);
		const invalid =
			(!embedded && !list.name.trim()) ||
			columns.length === 0 ||
			columns.some((c) => {
				const name = c.name.trim().toLowerCase();
				return (
					!name ||
					columns.filter((o) => o.name.trim().toLowerCase() === name).length > 1 ||
					(c.type === ColumnType.Choice && splitOptions(c.optionsText).length === 0)
				);
			});
		if (invalid) return;

		// Existing columns keep their key, so data that was already entered stays linked to the column.
		const keys: string[] = columns.filter((c) => c.id).map((c) => c.key);
		const result: ListColumn[] = columns.map((c, index) => {
			let key = c.key;
			if (!c.id) {
				key = createColumnKey(c.name, keys);
				keys.push(key);
			}
			return {
				id: c.id,
				key,
				name: c.name.trim(),
				type: c.type,
				options: c.type === ColumnType.Choice ? splitOptions(c.optionsText) : [],
				required: c.required,
				order: index,
			};
		});

		setSaving(true);
		service
			.saveList({ ...list, name: list.name.trim() }, result, embedded)
			.then(onSaved)
			.catch((e) => {
				setSaving(false);
				setError(errorMessage(e));
			});
	};

	return (
		<Stack tokens={{ childrenGap: 12 }} styles={{ root: { maxWidth: 900 } }}>
			<Text variant="xLarge">{embedded ? t("EditColumnsOnly") : listId ? t("EditList") : t("NewList")}</Text>
			<ErrorBar message={error} onDismiss={() => setError(undefined)} />
			{!embedded && (
				<>
					<TextField
						label={t("ListName")}
						required
						maxLength={100}
						value={list.name}
						errorMessage={nameError}
						onChange={(_, v) => setList({ ...list, name: v ?? "" })}
					/>
					<TextField
						label={t("ListDescription")}
						multiline
						rows={3}
						value={list.description}
						onChange={(_, v) => setList({ ...list, description: v ?? "" })}
					/>
				</>
			)}

			<Separator alignContent="start">
				<Text variant="large">{t("Columns")}</Text>
			</Separator>
			{hasRows && <MessageBar messageBarType={MessageBarType.info}>{t("HasRowsInfo")}</MessageBar>}
			{submitted && columns.length === 0 && (
				<MessageBar messageBarType={MessageBarType.error}>{t("Error_NoColumns")}</MessageBar>
			)}

			{columns.map((column, index) => (
				<Stack
					key={column.uiKey}
					tokens={{ childrenGap: 8 }}
					styles={{ root: { padding: 8, border: "1px solid #edebe9", borderRadius: 4 } }}
				>
					<Stack horizontal wrap verticalAlign="end" tokens={{ childrenGap: 8 }}>
						<TextField
							label={t("ColumnName")}
							required
							maxLength={100}
							value={column.name}
							errorMessage={columnError(column)}
							onChange={(_, v) => update(column.uiKey, { name: v ?? "" })}
							styles={{ root: { minWidth: 200, flexGrow: 1 } }}
						/>
						<Dropdown
							label={t("DataType")}
							options={typeOptions}
							selectedKey={column.type}
							// Changing the type of a column that has data would make the stored values invalid.
							disabled={hasRows && !!column.id}
							onChange={(_, o) => o && update(column.uiKey, { type: o.key as ColumnType })}
							styles={{ root: { width: 200 } }}
						/>
						<Checkbox
							label={t("Required")}
							checked={column.required}
							onChange={(_, v) => update(column.uiKey, { required: !!v })}
							styles={{ root: { marginBottom: 6 } }}
						/>
						<Stack horizontal>
							<IconButton
								iconProps={{ iconName: "Up" }}
								title={t("MoveUp")}
								ariaLabel={t("MoveUp")}
								disabled={index === 0}
								onClick={() => move(index, -1)}
							/>
							<IconButton
								iconProps={{ iconName: "Down" }}
								title={t("MoveDown")}
								ariaLabel={t("MoveDown")}
								disabled={index === columns.length - 1}
								onClick={() => move(index, 1)}
							/>
							<IconButton
								iconProps={{ iconName: "Delete" }}
								title={t("RemoveColumn")}
								ariaLabel={t("RemoveColumn")}
								onClick={() => setColumns(columns.filter((c) => c.uiKey !== column.uiKey))}
							/>
						</Stack>
					</Stack>
					{column.type === ColumnType.Choice && (
						<TextField
							label={t("ChoiceOptions")}
							description={t("ChoiceOptionsHelp")}
							multiline
							rows={3}
							value={column.optionsText}
							errorMessage={optionsError(column)}
							onChange={(_, v) => update(column.uiKey, { optionsText: v ?? "" })}
						/>
					)}
				</Stack>
			))}

			<Stack horizontal>
				<DefaultButton
					iconProps={{ iconName: "Add" }}
					text={t("AddColumn")}
					onClick={() => setColumns([...columns, newColumn(columns.length)])}
				/>
			</Stack>
			<Separator />
			<Stack horizontal tokens={{ childrenGap: 8 }}>
				<PrimaryButton text={saving ? t("Saving") : t("Save")} disabled={saving} onClick={save} />
				<DefaultButton text={t("Cancel")} disabled={saving} onClick={onCancel} />
			</Stack>
		</Stack>
	);
};

function newColumn(order: number): DraftColumn {
	return {
		uiKey: newUiKey(),
		key: "",
		name: "",
		type: ColumnType.Text,
		options: [],
		optionsText: "",
		required: false,
		order,
	};
}

function splitOptions(text: string): string[] {
	const options = text
		.split(/\r?\n/)
		.map((o) => o.trim())
		.filter((o) => o !== "");
	return options.filter((o, i) => options.findIndex((x) => x.toLowerCase() === o.toLowerCase()) === i);
}
