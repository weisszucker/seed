import type { ReactNode } from "react";
import { useTheme } from "../../theme-context.js";

export function ActionRow({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <box padding={theme.spacing.sm}>
      <box
        flexDirection="row"
        padding={theme.spacing.sm}
        gap={theme.spacing.sm}
        justifyContent="center"
      >
        {children}
      </box>
    </box>
  );
}
