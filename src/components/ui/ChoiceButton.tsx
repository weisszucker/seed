import type { ReactNode } from "react";
import { useTheme } from "../../theme-context.js";

interface ChoiceButtonProps {
  onPress: () => void;
  children: ReactNode;
}

export function ChoiceButton({ onPress, children }: ChoiceButtonProps) {
  const { theme } = useTheme();
  return (
    <box
      width={theme.modal.actionWidth}
      backgroundColor={theme.colors.surfaceMuted}
      padding={theme.spacing.sm}
      alignItems="center"
      onMouseDown={onPress}
    >
      {children}
    </box>
  );
}
