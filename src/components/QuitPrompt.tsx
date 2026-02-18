import { useTheme } from "../theme-context.js";
import { ActionRow } from "./ui/ActionRow.js";
import { ChoiceButton } from "./ui/ChoiceButton.js";
import { ModalShell } from "./ui/ModalShell.js";

interface QuitPromptProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function QuitPrompt({ isOpen, onConfirm, onCancel }: QuitPromptProps) {
  const { theme } = useTheme();

  return (
    <ModalShell isOpen={isOpen} height={theme.modal.quitHeight}>
      <box flexDirection="row" padding={1}>
        <text>
          <strong fg={theme.colors.warning}>Quit</strong>
        </text>
      </box>
      <box flexGrow={1} flexDirection="column" padding={1} justifyContent="center">
        <text fg={theme.colors.textPrimary}>Are you sure you want to quit?</text>
      </box>
      <ActionRow>
        <ChoiceButton onPress={onConfirm}>
          <text fg={theme.colors.success}>Yes</text>
        </ChoiceButton>
        <ChoiceButton onPress={onCancel}>
          <text fg={theme.colors.info}>No</text>
        </ChoiceButton>
      </ActionRow>
    </ModalShell>
  );
}
