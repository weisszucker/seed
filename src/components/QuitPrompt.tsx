interface QuitPromptProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function QuitPrompt({ isOpen, onConfirm, onCancel }: QuitPromptProps) {
  if (!isOpen) return null;

  return (
    <box
      position="absolute"
      top="35%"
      left="25%"
      width="50%"
      height={11}
      border
      backgroundColor="#1a1a2e"
      flexDirection="column"
    >
      <box flexDirection="row" padding={1}>
        <text>
          <strong fg="#f0c674">Quit</strong>
        </text>
      </box>
      <box flexGrow={1} flexDirection="column" padding={1} justifyContent="center">
        <text fg="#c5c8c6">Are you sure you want to quit?</text>
      </box>
      <box padding={1}>
        <box flexDirection="row"  padding={1} gap={1} justifyContent="center">
          <box width={10} backgroundColor="#383850" padding={1} alignItems="center" onMouseDown={onConfirm}>
            <text fg="#b5bd68">Yes</text>
          </box>
          <box width={10} backgroundColor="#383850" padding={1} alignItems="center" onMouseDown={onCancel}>
            <text fg="#5f819d">No</text>
          </box>
        </box>
      </box>
    </box>
  );
}
