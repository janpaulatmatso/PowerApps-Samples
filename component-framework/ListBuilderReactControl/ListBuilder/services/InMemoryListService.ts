import { ColumnType, ListColumn, ListDefinition, ListRow, RowValues } from "../types";
import { IListService } from "./IListService";

interface StoredRow extends ListRow {
	listId: string;
}

/**
 * Keeps lists in memory. Used when the data source property is set to "Demo",
 * for example in the test harness (npm start) where the Web API isn't available.
 */
export class InMemoryListService implements IListService {
	private lists: ListDefinition[] = [];
	private columns = new Map<string, ListColumn[]>();
	private rows: StoredRow[] = [];
	private nextId = 1;

	constructor(withSampleData = true) {
		if (withSampleData) {
			this.addSampleData();
		}
	}

	public getLists(): Promise<ListDefinition[]> {
		const sorted = [...this.lists].sort((a, b) => a.name.localeCompare(b.name));
		return this.result(sorted.map((l) => ({ ...l })));
	}

	public getList(listId: string): Promise<ListDefinition> {
		const list = this.lists.find((l) => l.id === listId);
		return list ? this.result({ ...list }) : Promise.reject(new Error(`List ${listId} not found`));
	}

	public saveList(list: ListDefinition, columns: ListColumn[]): Promise<string> {
		let listId = list.id;
		if (listId) {
			this.lists = this.lists.map((l) => (l.id === listId ? { ...list } : l));
		} else {
			listId = this.newId();
			this.lists.push({ ...list, id: listId });
		}
		this.columns.set(
			listId,
			columns.map((c) => ({ ...c, options: [...c.options], id: c.id ?? this.newId() }))
		);
		return this.result(listId);
	}

	public deleteList(listId: string): Promise<void> {
		this.lists = this.lists.filter((l) => l.id !== listId);
		this.columns.delete(listId);
		this.rows = this.rows.filter((r) => r.listId !== listId);
		return this.result(undefined);
	}

	public getColumns(listId: string): Promise<ListColumn[]> {
		const columns = (this.columns.get(listId) ?? []).map((c) => ({ ...c, options: [...c.options] }));
		return this.result(columns.sort((a, b) => a.order - b.order));
	}

	public getRows(listId: string): Promise<ListRow[]> {
		return this.result(
			this.rows.filter((r) => r.listId === listId).map((r) => ({ id: r.id, values: { ...r.values } }))
		);
	}

	public hasRows(listId: string): Promise<boolean> {
		return this.result(this.rows.some((r) => r.listId === listId));
	}

	public createRow(listId: string, values: RowValues): Promise<string> {
		const id = this.newId();
		this.rows.push({ id, listId, values: { ...values } });
		return this.result(id);
	}

	public updateRow(rowId: string, values: RowValues): Promise<void> {
		this.rows = this.rows.map((r) => (r.id === rowId ? { ...r, values: { ...values } } : r));
		return this.result(undefined);
	}

	public deleteRow(rowId: string): Promise<void> {
		this.rows = this.rows.filter((r) => r.id !== rowId);
		return this.result(undefined);
	}

	private newId(): string {
		const n = (this.nextId++).toString(16).padStart(12, "0");
		return `00000000-0000-4000-8000-${n}`;
	}

	/** Resolves asynchronously, like the Web API does. */
	private result<T>(value: T): Promise<T> {
		return new Promise((resolve) => setTimeout(() => resolve(value), 50));
	}

	private addSampleData(): void {
		const listId = this.newId();
		this.lists.push({
			id: listId,
			name: "Boodschappen",
			description: "Wat we deze week nog moeten halen",
		});
		const columns: ListColumn[] = [
			{ id: this.newId(), key: "product", name: "Product", type: ColumnType.Text, options: [], required: true, order: 0 },
			{ id: this.newId(), key: "aantal", name: "Aantal", type: ColumnType.WholeNumber, options: [], required: false, order: 1 },
			{
				id: this.newId(),
				key: "winkel",
				name: "Winkel",
				type: ColumnType.Choice,
				options: ["Supermarkt", "Bakker", "Markt"],
				required: false,
				order: 2,
			},
			{ id: this.newId(), key: "gekocht", name: "Gekocht", type: ColumnType.YesNo, options: [], required: false, order: 3 },
		];
		this.columns.set(listId, columns);
		this.rows.push(
			{ id: this.newId(), listId, values: { product: "Melk", aantal: 2, winkel: "Supermarkt", gekocht: false } },
			{ id: this.newId(), listId, values: { product: "Brood", aantal: 1, winkel: "Bakker", gekocht: true } }
		);
	}
}
