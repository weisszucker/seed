import type { ReactNode } from "react";
import { useTheme } from "../../theme-context.js";

interface ModalShellProps {
  isOpen: boolean;
  height: number;
  children: ReactNode;
}

export function ModalShell({ isOpen, height, children }: ModalShellProps) {
  const { theme } = useTheme();
  if (!isOpen) return null;

  return (
    <box
      position="absolute"
      top={theme.modal.top as `${number}%`}
      left={theme.modal.left as `${number}%`}
      width={theme.modal.width as `${number}%`}
      height={height}
      border
      backgroundColor={theme.colors.panelBackground}
      flexDirection="column"
    >
      {children}
    </box>
  );
}
