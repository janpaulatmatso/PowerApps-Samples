import { ListColumn, ListDefinition, ListRow, RowValues } from "../types";

/** Storage for user defined lists, their columns and their data rows. */
export interface IListService {
	getLists(): Promise<ListDefinition[]>;
	getList(listId: string): Promise<ListDefinition>;
	/** Creates or updates the list and synchronizes its columns. Returns the id of the list. */
	saveList(list: ListDefinition, columns: ListColumn[]): Promise<string>;
	/** Deletes the list together with its columns and rows. */
	deleteList(listId: string): Promise<void>;

	getColumns(listId: string): Promise<ListColumn[]>;

	getRows(listId: string): Promise<ListRow[]>;
	hasRows(listId: string): Promise<boolean>;
	createRow(listId: string, values: RowValues, columns: ListColumn[]): Promise<string>;
	updateRow(rowId: string, values: RowValues, columns: ListColumn[]): Promise<void>;
	deleteRow(rowId: string): Promise<void>;
}
