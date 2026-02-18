interface StatusBarProps {
  filePath: string | null;
  isModified: boolean;
  cursorLine: number;
  cursorCol: number;
  currentFocus: "sidebar" | "editor";
}

export function StatusBar({
  filePath,
  isModified,
  cursorLine,
  cursorCol,
  currentFocus,
}: StatusBarProps) {
  const fileName = filePath ? filePath.split("/").pop() : "Untitled";
  const mode = currentFocus === "editor" ? "EDIT" : "NAVIGATE";

  return (
    <box
      flexDirection="row"
      height={1}
      backgroundColor="#2a2a3e"
      paddingLeft={1}
      paddingRight={1}
    >
      <text>
        <span fg="#f0c674">{mode}</span>
        <span fg="#666"> │ </span>
        <span fg="#b5bd68">{fileName}</span>
        {isModified && (
          <>
            <span> </span>
            <span fg="#cc6666">[modified]</span>
          </>
        )}
      </text>
      
      <box flexGrow={1} />
      
      <text>
        <span fg="#81a2be">Ln {cursorLine}, Col {cursorCol}</span>
        <span fg="#666"> │ </span>
        <span fg="#5f819d">UTF-8</span>
      </text>
    </box>
  );
}