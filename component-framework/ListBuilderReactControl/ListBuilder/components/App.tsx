import * as React from "react";
import { MessageBar, MessageBarType, Stack } from "@fluentui/react";
import { IListService } from "../services/IListService";
import { Translate } from "../types";
import { HostMode } from "../utils/hostContext";
import { ListOverview } from "./ListOverview";
import { ListDesigner } from "./ListDesigner";
import { ListData } from "./ListData";

export interface AppProps {
	service: IListService;
	t: Translate;
	locale: string;
	width?: number;
	hostMode: HostMode;
}

type View = { name: "overview" } | { name: "design"; listId?: string } | { name: "data"; listId: string };

/**
 * Switches between the overview of lists, the list designer and the data of a list.
 * On the form of a list (embedded) only the data and the columns of that list are shown.
 */
export const App: React.FC<AppProps> = ({ service, t, locale, width, hostMode }) => {
	const embedded = hostMode.kind === "embedded";
	const [view, setView] = React.useState<View>(
		hostMode.kind === "embedded" ? { name: "data", listId: hostMode.listId } : { name: "overview" }
	);
	const showOverview = React.useCallback(() => setView({ name: "overview" }), []);

	const frame = (content: React.ReactElement) => (
		<Stack styles={{ root: { width: width ?? "100%", minHeight: 400, padding: 8, boxSizing: "border-box", textAlign: "left" } }}>
			{content}
		</Stack>
	);

	if (hostMode.kind === "unsavedList") {
		return frame(<MessageBar messageBarType={MessageBarType.info}>{t("SaveListFirst")}</MessageBar>);
	}

	let content: React.ReactElement;
	switch (view.name) {
		case "design":
			content = (
				<ListDesigner
					service={service}
					t={t}
					listId={view.listId}
					embedded={embedded}
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
					onBack={embedded ? undefined : showOverview}
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

	return frame(content);
};
