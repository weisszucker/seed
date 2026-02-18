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
      top="35%"
      left="25%"
      width="50%"
      height={10}
      border
      backgroundColor="#1a1a2e"
      flexDirection="column"
    >
      {/* Header */}
      <box flexDirection="row" padding={1}>
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

      {/* Actions */}
      <box padding={1}>
        <box flexDirection="row" backgroundColor="#2a2a3e" padding={1} gap={1}>
          <box
            width="50%"
            backgroundColor="#383850"
            padding={1}
            justifyContent="center"
            onMouseDown={onSave}
          >
            <text fg="#b5bd68">Yes</text>
          </box>
          <box
            width="50%"
            backgroundColor="#383850"
            padding={1}
            justifyContent="center"
            onMouseDown={onDiscard}
          >
            <text fg="#cc6666">No</text>
          </box>
        </box>
      </box>
    </box>
  );
}
