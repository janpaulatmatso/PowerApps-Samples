import { ColumnType, ListColumn, ListDefinition, ListRow, RowValues } from "../types";
import { summarizeRow } from "../utils/values";
import { IListService } from "./IListService";

// Tables created by setup/Create-ListTables.ps1
const LIST_TABLE = "sample_lijst";
const LIST_ENTITY_SET = "sample_lijsts";
const COLUMN_TABLE = "sample_lijstkolom";
const ROW_TABLE = "sample_lijstregel";
// Navigation property of the sample_lijstid lookup on sample_lijstkolom and sample_lijstregel
const LIST_LOOKUP_NAVIGATION = "sample_LijstId";

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Stores lists, columns and rows in Dataverse using the Web API of the component framework. */
export class DataverseListService implements IListService {
	constructor(private readonly webAPI: ComponentFramework.WebApi) {}

	public async getLists(): Promise<ListDefinition[]> {
		const entities = await this.retrieveAll(
			LIST_TABLE,
			"?$select=sample_lijstid,sample_name,sample_omschrijving&$orderby=sample_name"
		);
		return entities.map(toList);
	}

	public async getList(listId: string): Promise<ListDefinition> {
		const entity = await this.webAPI.retrieveRecord(
			LIST_TABLE,
			checkId(listId),
			"?$select=sample_lijstid,sample_name,sample_omschrijving"
		);
		return toList(entity);
	}

	public async saveList(list: ListDefinition, columns: ListColumn[]): Promise<string> {
		const data: ComponentFramework.WebApi.Entity = {
			sample_name: list.name,
			sample_omschrijving: list.description,
		};

		let listId: string;
		if (list.id) {
			listId = checkId(list.id);
			await this.webAPI.updateRecord(LIST_TABLE, listId, data);
		} else {
			listId = (await this.webAPI.createRecord(LIST_TABLE, data)).id;
		}

		const existing = list.id ? await this.getColumns(listId) : [];
		for (const column of columns) {
			const columnData = toColumnEntity(column);
			if (column.id) {
				await this.webAPI.updateRecord(COLUMN_TABLE, checkId(column.id), columnData);
			} else {
				columnData[`${LIST_LOOKUP_NAVIGATION}@odata.bind`] = `/${LIST_ENTITY_SET}(${listId})`;
				await this.webAPI.createRecord(COLUMN_TABLE, columnData);
			}
		}
		for (const removed of existing.filter((e) => !columns.some((c) => c.id === e.id))) {
			await this.webAPI.deleteRecord(COLUMN_TABLE, checkId(removed.id));
		}
		return listId;
	}

	public async deleteList(listId: string): Promise<void> {
		// The relationships cascade the delete to the columns and rows of the list.
		await this.webAPI.deleteRecord(LIST_TABLE, checkId(listId));
	}

	public async getColumns(listId: string): Promise<ListColumn[]> {
		const entities = await this.retrieveAll(
			COLUMN_TABLE,
			"?$select=sample_lijstkolomid,sample_name,sample_sleutel,sample_datatype,sample_opties,sample_verplicht,sample_volgorde" +
				`&$filter=_sample_lijstid_value eq ${checkId(listId)}&$orderby=sample_volgorde`
		);
		return entities.map((e) => ({
			id: e.sample_lijstkolomid as string,
			key: e.sample_sleutel as string,
			name: e.sample_name as string,
			type: e.sample_datatype as ColumnType,
			options: parseJson<string[]>(e.sample_opties as string | null, []),
			required: e.sample_verplicht === true,
			order: (e.sample_volgorde as number | null) ?? 0,
		}));
	}

	public async getRows(listId: string): Promise<ListRow[]> {
		const entities = await this.retrieveAll(
			ROW_TABLE,
			"?$select=sample_lijstregelid,sample_waarden" +
				`&$filter=_sample_lijstid_value eq ${checkId(listId)}&$orderby=createdon`
		);
		return entities.map((e) => ({
			id: e.sample_lijstregelid as string,
			values: parseJson<RowValues>(e.sample_waarden as string | null, {}),
		}));
	}

	public async hasRows(listId: string): Promise<boolean> {
		const result = await this.webAPI.retrieveMultipleRecords(
			ROW_TABLE,
			`?$select=sample_lijstregelid&$filter=_sample_lijstid_value eq ${checkId(listId)}`,
			1
		);
		return result.entities.length > 0;
	}

	public async createRow(listId: string, values: RowValues, columns: ListColumn[]): Promise<string> {
		const data = toRowEntity(values, columns);
		data[`${LIST_LOOKUP_NAVIGATION}@odata.bind`] = `/${LIST_ENTITY_SET}(${checkId(listId)})`;
		return (await this.webAPI.createRecord(ROW_TABLE, data)).id;
	}

	public async updateRow(rowId: string, values: RowValues, columns: ListColumn[]): Promise<void> {
		await this.webAPI.updateRecord(ROW_TABLE, checkId(rowId), toRowEntity(values, columns));
	}

	public async deleteRow(rowId: string): Promise<void> {
		await this.webAPI.deleteRecord(ROW_TABLE, checkId(rowId));
	}

	/** Retrieves all pages of a query by following the nextLink of each response. */
	private async retrieveAll(table: string, options: string): Promise<ComponentFramework.WebApi.Entity[]> {
		const entities: ComponentFramework.WebApi.Entity[] = [];
		let query: string | undefined = options;
		while (query) {
			const response: ComponentFramework.WebApi.RetrieveMultipleResponse =
				await this.webAPI.retrieveMultipleRecords(table, query, 5000);
			entities.push(...response.entities);
			query = response.nextLink ? response.nextLink.substring(response.nextLink.indexOf("?")) : undefined;
		}
		return entities;
	}
}

function toList(e: ComponentFramework.WebApi.Entity): ListDefinition {
	return {
		id: e.sample_lijstid as string,
		name: e.sample_name as string,
		description: (e.sample_omschrijving as string | null) ?? "",
	};
}

function toColumnEntity(column: ListColumn): ComponentFramework.WebApi.Entity {
	return {
		sample_name: column.name,
		sample_sleutel: column.key,
		sample_datatype: column.type,
		sample_opties: column.type === ColumnType.Choice ? JSON.stringify(column.options) : null,
		sample_verplicht: column.required,
		sample_volgorde: column.order,
	};
}

function toRowEntity(values: RowValues, columns: ListColumn[]): ComponentFramework.WebApi.Entity {
	return {
		sample_name: summarizeRow(values, columns),
		sample_waarden: JSON.stringify(values),
	};
}

function parseJson<T>(json: string | null | undefined, fallback: T): T {
	if (!json) return fallback;
	try {
		return JSON.parse(json) as T;
	} catch {
		return fallback;
	}
}

/** Guards the ids that are put into OData queries and URLs. */
function checkId(id: string | undefined): string {
	const trimmed = (id ?? "").replace(/[{}]/g, "");
	if (!GUID_PATTERN.test(trimmed)) {
		throw new Error(`Invalid id: ${id ?? ""}`);
	}
	return trimmed;
}
