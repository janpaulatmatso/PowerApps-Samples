import * as React from "react";
import {
	DefaultButton,
	Dialog,
	DialogFooter,
	DialogType,
	MessageBar,
	MessageBarType,
	PrimaryButton,
	Spinner,
	SpinnerSize,
} from "@fluentui/react";
import { Translate } from "../types";

/** Turns an error from the Web API or a script into a readable message. */
export function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "object" && error !== null && "message" in error) {
		return String(error.message);
	}
	return String(error);
}

export const ErrorBar: React.FC<{ message?: string; onDismiss: () => void }> = ({ message, onDismiss }) =>
	message ? (
		<MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={onDismiss}>
			{message}
		</MessageBar>
	) : null;

export const Loading: React.FC<{ t: Translate }> = ({ t }) => (
	<Spinner size={SpinnerSize.large} label={t("Loading")} styles={{ root: { padding: 32 } }} />
);

export interface ConfirmDialogProps {
	t: Translate;
	hidden: boolean;
	title: string;
	text: string;
	onConfirm: () => void;
	onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ t, hidden, title, text, onConfirm, onCancel }) => (
	<Dialog
		hidden={hidden}
		onDismiss={onCancel}
		dialogContentProps={{ type: DialogType.normal, title, subText: text }}
		modalProps={{ isBlocking: true }}
	>
		<DialogFooter>
			<PrimaryButton text={t("Delete")} onClick={onConfirm} />
			<DefaultButton text={t("Cancel")} onClick={onCancel} />
		</DialogFooter>
	</Dialog>
);
