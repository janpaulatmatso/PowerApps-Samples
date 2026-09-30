/** The table on whose form the control shows a single list. */
export const LIST_TABLE = "sample_lijst";

const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";

/**
 * Where the control is hosted:
 * - standalone: anywhere else; shows the overview of all lists
 * - embedded: on the form of a saved sample_lijst record; shows that list
 * - unsavedList: on the form of a new sample_lijst record that hasn't been saved yet
 */
export type HostMode = { kind: "standalone" } | { kind: "embedded"; listId: string } | { kind: "unsavedList" };

/** The undocumented, but widely available, context.mode.contextInfo of a model-driven form. */
export interface ContextInfo {
	entityTypeName?: string;
	entityId?: string;
}

export function getHostMode(contextInfo: ContextInfo | undefined): HostMode {
	if (contextInfo?.entityTypeName !== LIST_TABLE) {
		return { kind: "standalone" };
	}
	const id = (contextInfo.entityId ?? "").replace(/[{}]/g, "").toLowerCase();
	return id && id !== EMPTY_GUID ? { kind: "embedded", listId: id } : { kind: "unsavedList" };
}
