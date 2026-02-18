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
      top="40%"
      left="35%"
      width="30%"
      height="18%"
      border
      backgroundColor="#1a1a2e"
      flexDirection="column"
    >
      <box flexDirection="row" backgroundColor="#2a2a3e" padding={1}>
        <text>
          <strong fg="#f0c674">Quit</strong>
        </text>
      </box>
      <box flexGrow={1} flexDirection="column" padding={1} justifyContent="center">
        <text fg="#c5c8c6">Are you sure you want to quit?</text>
      </box>
      <box flexDirection="row" padding={1} gap={2} justifyContent="center">
        <box border padding={1} onMouseDown={onConfirm}>
          <text fg="#b5bd68">Yes</text>
        </box>
        <box border padding={1} onMouseDown={onCancel}>
          <text fg="#5f819d">No</text>
        </box>
      </box>
    </box>
  );
}
