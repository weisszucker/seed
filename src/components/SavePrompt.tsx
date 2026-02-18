interface SavePromptProps {
  isOpen: boolean;
  fileName: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function SavePrompt({ isOpen, fileName, onSave, onDiscard, onCancel }: SavePromptProps) {
  if (!isOpen) return null;

  return (
    <box
      position="absolute"
      top="40%"
      left="30%"
      width="40%"
      height="20%"
      border
      backgroundColor="#1a1a2e"
      flexDirection="column"
    >
      {/* Header */}
      <box flexDirection="row" backgroundColor="#2a2a3e" padding={1}>
        <text>
          <strong fg="#f0c674">Save Changes?</strong>
        </text>
      </box>

      {/* Message */}
      <box flexGrow={1} flexDirection="column" padding={1} justifyContent="center">
        <text fg="#c5c8c6">
          The file <span fg="#f0c674">{fileName}</span> has unsaved changes.
        </text>
        <text fg="#c5c8c6">Do you want to save them?</text>
      </box>

      {/* Buttons */}
      <box flexDirection="row" padding={1} gap={2} justifyContent="center">
        <box border padding={1} onMouseDown={onSave}>
          <text fg="#b5bd68">Save</text>
        </box>
        <box border padding={1} onMouseDown={onDiscard}>
          <text fg="#cc6666">Don't Save</text>
        </box>
        <box border padding={1} onMouseDown={onCancel}>
          <text fg="#5f819d">Cancel</text>
        </box>
      </box>
    </box>
  );
}