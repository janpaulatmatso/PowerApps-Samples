import * as React from "react";
import {
	CommandBar,
	DetailsList,
	DetailsListLayoutMode,
	IColumn,
	ICommandBarItemProps,
	Selection,
	SelectionMode,
	Stack,
	Text,
} from "@fluentui/react";
import { IListService } from "../services/IListService";
import { ListDefinition, Translate } from "../types";
import { ConfirmDialog, ErrorBar, Loading, errorMessage } from "./Shared";

export interface ListOverviewProps {
	service: IListService;
	t: Translate;
	onNew: () => void;
	onOpen: (listId: string) => void;
	onEdit: (listId: string) => void;
}

/** Shows all lists and lets the user create, open, edit or delete one. */
export const ListOverview: React.FC<ListOverviewProps> = ({ service, t, onNew, onOpen, onEdit }) => {
	const [lists, setLists] = React.useState<ListDefinition[]>();
	const [selected, setSelected] = React.useState<ListDefinition>();
	const [confirmDelete, setConfirmDelete] = React.useState(false);
	const [error, setError] = React.useState<string>();

	const load = React.useCallback(() => {
		setLists(undefined);
		service
			.getLists()
			.then(setLists)
			.catch((e) => {
				setLists([]);
				setError(errorMessage(e));
			});
	}, [service]);

	React.useEffect(load, [load]);

	const selection = React.useMemo(() => {
		const s: Selection = new Selection({
			onSelectionChanged: () => setSelected(s.getSelection()[0] as ListDefinition | undefined),
		});
		return s;
	}, []);

	const deleteSelected = () => {
		setConfirmDelete(false);
		if (!selected?.id) return;
		service
			.deleteList(selected.id)
			.then(load)
			.catch((e) => setError(errorMessage(e)));
	};

	const commands: ICommandBarItemProps[] = [
		{ key: "new", text: t("NewList"), iconProps: { iconName: "Add" }, onClick: onNew },
		{
			key: "open",
			text: t("OpenList"),
			iconProps: { iconName: "OpenInNewWindow" },
			disabled: !selected,
			onClick: () => {
				if (selected?.id) onOpen(selected.id);
			},
		},
		{
			key: "edit",
			text: t("EditColumns"),
			iconProps: { iconName: "ColumnOptions" },
			disabled: !selected,
			onClick: () => {
				if (selected?.id) onEdit(selected.id);
			},
		},
		{
			key: "delete",
			text: t("Delete"),
			iconProps: { iconName: "Delete" },
			disabled: !selected,
			onClick: () => setConfirmDelete(true),
		},
		{ key: "refresh", text: t("Refresh"), iconProps: { iconName: "Refresh" }, onClick: load },
	];

	const columns: IColumn[] = [
		{ key: "name", name: t("ListName"), fieldName: "name", minWidth: 150, maxWidth: 300, isResizable: true },
		{ key: "department", name: t("Department"), fieldName: "department", minWidth: 100, maxWidth: 200, isResizable: true },
		{ key: "process", name: t("Process"), fieldName: "process", minWidth: 100, maxWidth: 200, isResizable: true },
		{
			key: "description",
			name: t("ListDescription"),
			fieldName: "description",
			minWidth: 200,
			isResizable: true,
			isMultiline: true,
		},
	];

	return (
		<Stack tokens={{ childrenGap: 8 }}>
			<Text variant="xLarge">{t("MyLists")}</Text>
			<CommandBar items={commands} />
			<ErrorBar message={error} onDismiss={() => setError(undefined)} />
			{lists === undefined ? (
				<Loading t={t} />
			) : lists.length === 0 ? (
				<Text styles={{ root: { padding: 16 } }}>{t("NoLists")}</Text>
			) : (
				<DetailsList
					items={lists}
					columns={columns}
					selection={selection}
					selectionMode={SelectionMode.single}
					layoutMode={DetailsListLayoutMode.justified}
					getKey={(item: ListDefinition) => item.id ?? ""}
					onItemInvoked={(item: ListDefinition) => item.id && onOpen(item.id)}
				/>
			)}
			<ConfirmDialog
				t={t}
				hidden={!confirmDelete}
				title={t("DeleteListTitle")}
				text={t("DeleteListText", selected?.name ?? "")}
				onConfirm={deleteSelected}
				onCancel={() => setConfirmDelete(false)}
			/>
		</Stack>
	);
};
