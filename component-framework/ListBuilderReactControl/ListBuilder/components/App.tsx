import * as React from "react";
import { Stack } from "@fluentui/react";
import { IListService } from "../services/IListService";
import { Translate } from "../types";
import { ListOverview } from "./ListOverview";
import { ListDesigner } from "./ListDesigner";
import { ListData } from "./ListData";

export interface AppProps {
	service: IListService;
	t: Translate;
	locale: string;
	width?: number;
}

type View = { name: "overview" } | { name: "design"; listId?: string } | { name: "data"; listId: string };

/** Switches between the overview of lists, the list designer and the data of a list. */
export const App: React.FC<AppProps> = ({ service, t, locale, width }) => {
	const [view, setView] = React.useState<View>({ name: "overview" });
	const showOverview = React.useCallback(() => setView({ name: "overview" }), []);

	let content: React.ReactElement;
	switch (view.name) {
		case "design":
			content = (
				<ListDesigner
					service={service}
					t={t}
					listId={view.listId}
					onSaved={(listId) => setView({ name: "data", listId })}
					onCancel={() => (view.listId ? setView({ name: "data", listId: view.listId }) : showOverview())}
				/>
			);
			break;
		case "data":
			content = (
				<ListData
					service={service}
					t={t}
					locale={locale}
					listId={view.listId}
					onBack={showOverview}
					onEditColumns={() => setView({ name: "design", listId: view.listId })}
				/>
			);
			break;
		default:
			content = (
				<ListOverview
					service={service}
					t={t}
					onNew={() => setView({ name: "design" })}
					onOpen={(listId) => setView({ name: "data", listId })}
					onEdit={(listId) => setView({ name: "design", listId })}
				/>
			);
	}

	return (
		<Stack styles={{ root: { width: width ?? "100%", minHeight: 400, padding: 8, boxSizing: "border-box", textAlign: "left" } }}>
			{content}
		</Stack>
	);
};
