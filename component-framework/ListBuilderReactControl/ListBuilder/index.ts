import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { initializeIcons } from "@fluentui/react";
import { App } from "./components/App";
import { IListService } from "./services/IListService";
import { DataverseListService } from "./services/DataverseListService";
import { InMemoryListService } from "./services/InMemoryListService";
import { Translate } from "./types";

initializeIcons(undefined, { disableWarnings: true });

const LOCALES: Record<number, string> = {
	1033: "en-US",
	1043: "nl-NL",
	2067: "nl-BE",
};

export class ListBuilder implements ComponentFramework.ReactControl<IInputs, IOutputs> {
	private service: IListService;
	private dataSource: string;
	private translate: Translate;

	/**
	 * Used to initialize the control instance. Controls can kick off remote server calls and other initialization actions here.
	 * @param context The entire property bag available to control via Context Object.
	 * @param notifyOutputChanged A callback method to alert the framework that the control has new outputs ready to be retrieved asynchronously.
	 * @param state A piece of data that persists in one session for a single user.
	 */
	public init(
		context: ComponentFramework.Context<IInputs>,
		notifyOutputChanged: () => void,
		state: ComponentFramework.Dictionary
	): void {
		context.mode.trackContainerResize(true);
		this.translate = (key, ...args) => {
			const text = context.resources.getString(key) || key;
			return args.reduce<string>((t, arg, i) => t.split(`{${i}}`).join(String(arg)), text);
		};
	}

	/**
	 * Called when any value in the property bag has changed.
	 * @param context The entire property bag available to control via Context Object.
	 */
	public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
		const dataSource = context.parameters.dataSource.raw ?? "Dataverse";
		if (!this.service || dataSource !== this.dataSource) {
			this.dataSource = dataSource;
			this.service =
				dataSource === "Demo" ? new InMemoryListService() : new DataverseListService(context.webAPI);
		}

		return React.createElement(App, {
			// Remount the app when the data source changes, so it reloads its data.
			key: dataSource,
			service: this.service,
			t: this.translate,
			locale: LOCALES[context.userSettings.languageId] ?? "en-US",
			width: context.mode.allocatedWidth > 0 ? context.mode.allocatedWidth : undefined,
		});
	}

	/**
	 * It is called by the framework prior to a control receiving new data.
	 * @returns an object based on nomenclature defined in manifest, expecting object[s] for property marked as "bound" or "output"
	 */
	public getOutputs(): IOutputs {
		return {};
	}

	/**
	 * Called when the control is to be removed from the DOM tree. Controls should use this call for cleanup.
	 */
	public destroy(): void {
		// Nothing to clean up
	}
}
