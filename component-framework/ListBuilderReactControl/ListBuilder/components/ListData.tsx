import * as React from "react";
import {
	CommandBar,
	DetailsList,
	DetailsListLayoutMode,
	IColumn,
	ICommandBarItemProps,
	Pivot,
	PivotItem,
	Selection,
	SelectionMode,
	Stack,
	Text,
} from "@fluentui/react";
import { IListService } from "../services/IListService";
import { ListColumn, ListDefinition, ListRow, RowValues, Translate } from "../types";
import { formatValue } from "../utils/values";
import { CsvImport } from "./CsvImport";
import { RowForm } from "./RowForm";
import { ConfirmDialog, ErrorBar, Loading, errorMessage } from "./Shared";

export interface ListDataProps {
	service: IListService;
	t: Translate;
	locale: string;
	listId: string;
	/** Returns to the overview of lists. Undefined when the control is embedded on the form of the list. */
	onBack?: () => void;
	onEditColumns: () => void;
}

type Tab = "form" | "rows" | "import";

/** Shows a list with tabs for the input form, the entered rows and the CSV import. */
export const ListData: React.FC<ListDataProps> = ({ service, t, locale, listId, onBack, onEditColumns }) => {
	const [list, setList] = React.useState<ListDefinition>();
	const [columns, setColumns] = React.useState<ListColumn[]>([]);
	const [rows, setRows] = React.useState<ListRow[]>();
	const [tab, setTab] = React.useState<Tab>("form");
	const [editing, setEditing] = React.useState<ListRow>();
	const [selected, setSelected] = React.useState<ListRow>();
	const [confirmDelete, setConfirmDelete] = React.useState(false);
	const [error, setError] = React.useState<string>();

	const loadRows = React.useCallback(
		() =>
			service
				.getRows(listId)
				.then(setRows)
				.catch((e) => setError(errorMessage(e))),
		[service, listId]
	);

	React.useEffect(() => {
		Promise.all([service.getList(listId), service.getColumns(listId)])
			.then(([l, c]) => {
				setList(l);
				setColumns(c);
				return loadRows();
			})
			.catch((e) => setError(errorMessage(e)));
	}, [service, listId, loadRows]);

	const selection = React.useMemo(() => {
		const s: Selection = new Selection({
			onSelectionChanged: () => setSelected(s.getSelection()[0] as ListRow | undefined),
		});
		return s;
	}, []);

	const saveRow = async (values: RowValues) => {
		setError(undefined);
		try {
			if (editing?.id) {
				await service.updateRow(editing.id, values, columns);
				setEditing(undefined);
				setTab("rows");
			} else {
				await service.createRow(listId, values, columns);
			}
			await loadRows();
		} catch (e) {
			setError(errorMessage(e));
			throw e;
		}
	};

	const deleteSelected = () => {
		setConfirmDelete(false);
		if (!selected?.id) return;
		service
			.deleteRow(selected.id)
			.then(loadRows)
			.catch((e) => setError(errorMessage(e)));
	};

	const editRow = (row: ListRow) => {
		setEditing(row);
		setTab("form");
	};

	if (!list) {
		return error ? <ErrorBar message={error} onDismiss={() => setError(undefined)} /> : <Loading t={t} />;
	}

	const commands: ICommandBarItemProps[] = onBack
		? [
				{ key: "back", text: t("BackToLists"), iconProps: { iconName: "Back" }, onClick: onBack },
				{ key: "columns", text: t("EditColumns"), iconProps: { iconName: "ColumnOptions" }, onClick: onEditColumns },
			]
		: [{ key: "columns", text: t("EditColumnsOnly"), iconProps: { iconName: "ColumnOptions" }, onClick: onEditColumns }];

	const rowCommands: ICommandBarItemProps[] = [
		{
			key: "new",
			text: t("NewRow"),
			iconProps: { iconName: "Add" },
			onClick: () => {
				setEditing(undefined);
				setTab("form");
			},
		},
		{
			key: "edit",
			text: t("Edit"),
			iconProps: { iconName: "Edit" },
			disabled: !selected,
			onClick: () => selected && editRow(selected),
		},
		{
			key: "delete",
			text: t("Delete"),
			iconProps: { iconName: "Delete" },
			disabled: !selected,
			onClick: () => setConfirmDelete(true),
		},
		{ key: "refresh", text: t("Refresh"), iconProps: { iconName: "Refresh" }, onClick: () => void loadRows() },
	];

	const gridColumns: IColumn[] = columns.map((c) => ({
		key: c.key,
		name: c.name,
		minWidth: 80,
		maxWidth: 250,
		isResizable: true,
		onRender: (row: ListRow) => formatValue(c, row.values[c.key], locale, t("Yes"), t("No")),
	}));

	return (
		<Stack tokens={{ childrenGap: 8 }}>
			<CommandBar items={commands} />
			{/* On the form of the list, the form already shows the name and description. */}
			{onBack && <Text variant="xLarge">{list.name}</Text>}
			{onBack && list.description && <Text styles={{ root: { whiteSpace: "pre-wrap" } }}>{list.description}</Text>}
			<ErrorBar message={error} onDismiss={() => setError(undefined)} />

			<Pivot selectedKey={tab} onLinkClick={(item) => item && setTab(item.props.itemKey as Tab)}>
				<PivotItem itemKey="form" headerText={editing ? t("EditRow") : t("InputForm")} itemIcon="EditNote">
					<Stack styles={{ root: { paddingTop: 12 } }}>
						{columns.length === 0 ? (
							<Text>{t("NoColumns")}</Text>
						) : (
							<RowForm
								t={t}
								locale={locale}
								columns={columns}
								initialValues={editing?.values}
								onSubmit={saveRow}
								onCancel={
									editing
										? () => {
												setEditing(undefined);
												setTab("rows");
											}
										: undefined
								}
							/>
						)}
					</Stack>
				</PivotItem>
				<PivotItem
					itemKey="rows"
					headerText={t("Rows")}
					itemCount={rows?.length}
					itemIcon="Table"
				>
					<CommandBar items={rowCommands} />
					{rows === undefined ? (
						<Loading t={t} />
					) : rows.length === 0 ? (
						<Text styles={{ root: { padding: 16 } }}>{t("NoRows")}</Text>
					) : (
						<DetailsList
							items={rows}
							columns={gridColumns}
							selection={selection}
							selectionMode={SelectionMode.single}
							layoutMode={DetailsListLayoutMode.justified}
							getKey={(row: ListRow) => row.id ?? ""}
							onItemInvoked={editRow}
						/>
					)}
				</PivotItem>
				<PivotItem itemKey="import" headerText={t("CsvImport")} itemIcon="Upload">
					<CsvImport
						t={t}
						locale={locale}
						columns={columns}
						createRow={(values) => service.createRow(listId, values, columns)}
						onImported={() => void loadRows()}
					/>
				</PivotItem>
			</Pivot>

			<ConfirmDialog
				t={t}
				hidden={!confirmDelete}
				title={t("DeleteRowTitle")}
				text={t("DeleteRowText")}
				onConfirm={deleteSelected}
				onCancel={() => setConfirmDelete(false)}
			/>
		</Stack>
	);
};
