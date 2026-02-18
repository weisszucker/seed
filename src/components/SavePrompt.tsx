import { useTheme } from "../theme-context.js";
import { ActionRow } from "./ui/ActionRow.js";
import { ChoiceButton } from "./ui/ChoiceButton.js";
import { ModalShell } from "./ui/ModalShell.js";

interface SavePromptProps {
  isOpen: boolean;
  fileName: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function SavePrompt({ isOpen, fileName, onSave, onDiscard, onCancel }: SavePromptProps) {
  const { theme } = useTheme();

  return (
    <ModalShell isOpen={isOpen} height={theme.modal.saveHeight}>
      {/* Header */}
      <box flexDirection="row" padding={1}>
        <text>
          <strong fg={theme.colors.warning}>Save Changes?</strong>
        </text>
      </box>

      {/* Message */}
      <box flexGrow={1} flexDirection="column" padding={1} justifyContent="center">
        <text fg={theme.colors.textPrimary}>
          The file <span fg={theme.colors.warning}>{fileName}</span> has unsaved changes.
        </text>
        <text fg={theme.colors.textPrimary}>Do you want to save them?</text>
      </box>

      {/* Actions */}
      <ActionRow>
        <ChoiceButton onPress={onSave}>
          <text fg={theme.colors.success}>Yes</text>
        </ChoiceButton>
        <ChoiceButton onPress={onDiscard}>
          <text fg={theme.colors.danger}>No</text>
        </ChoiceButton>
      </ActionRow>
    </ModalShell>
  );
}
