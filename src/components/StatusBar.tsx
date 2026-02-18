import { useTheme } from "../theme-context.js";

interface StatusBarProps {
  filePath: string | null;
  isModified: boolean;
  cursorLine: number;
  cursorCol: number;
  currentFocus: "sidebar" | "editor";
  notice?: string | null;
}

export function StatusBar({
  filePath,
  isModified,
  cursorLine,
  cursorCol,
  currentFocus,
  notice,
}: StatusBarProps) {
  const { theme } = useTheme();
  const fileName = filePath ? filePath.split("/").pop() : "Untitled";
  const mode = currentFocus === "editor" ? "EDIT" : "NAVIGATE";

  return (
    <box
      flexDirection="row"
      height={1}
      backgroundColor={theme.colors.surface}
      paddingLeft={1}
      paddingRight={1}
    >
      <text>
        <span fg={theme.colors.warning}>{mode}</span>
        <span fg={theme.colors.textMuted}> │ </span>
        <span fg={theme.colors.success}>{fileName}</span>
        {isModified && (
          <>
            <span> </span>
            <span fg={theme.colors.danger}>[modified]</span>
          </>
        )}
      </text>
      
      <box flexGrow={1} />
      
      <text>
        {notice ? (
          <span fg={theme.colors.info}>{notice}</span>
        ) : (
          <>
            <span fg={theme.colors.info}>Ln {cursorLine}, Col {cursorCol}</span>
            <span fg={theme.colors.textMuted}> │ </span>
            <span fg={theme.colors.info}>UTF-8</span>
          </>
        )}
      </text>
    </box>
  );
}
