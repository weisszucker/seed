import type { InputRenderable } from "@opentui/core"

import type { DeveloperTodoItem } from "../../core/types"
import { uiColors, uiLayout } from "../../theme"

type DeveloperTodoModalProps = {
  items: DeveloperTodoItem[]
  draftInput: string
  selectedIndex: number | null
  focusedSection: "list" | "input"
  loading: boolean
  inputRef: { current: InputRenderable | null }
  onDraftChange: (text: string) => void
  onSubmit: () => void
  onCancel: () => void
}

export function DeveloperTodoModal({
  items,
  draftInput,
  selectedIndex,
  focusedSection,
  loading,
  inputRef,
  onDraftChange,
  onSubmit,
  onCancel,
}: DeveloperTodoModalProps) {
  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      zIndex={uiLayout.modalZIndex}
    >
      <box
        width={uiLayout.modalWidth}
        border
        borderColor={uiColors.modalBorder}
        paddingLeft={uiLayout.panelOuterMarginX}
        paddingRight={uiLayout.panelOuterMarginX}
        paddingBottom={0}
        paddingTop={0}
        backgroundColor={uiColors.modalBackground}
        flexDirection="column"
      >
        <box flexDirection="row" alignItems="center">
          <text fg={uiColors.accent}>Developer todo</text>
          <box flexGrow={1} />
          <box paddingLeft={0} paddingRight={0} onMouseDown={onCancel}>
            <text fg={uiColors.textMuted}>esc</text>
          </box>
        </box>

        <box flexDirection="column" marginTop={uiLayout.modalHeaderBodyGap}>
          {loading ? <text fg={uiColors.textMuted}>Loading...</text> : null}

          {!loading && items.length === 0 ? <text fg={uiColors.textMuted}>No todo items</text> : null}

          {!loading
            ? items.map((item, index) => {
                const selected = selectedIndex === index
                const listFocused = focusedSection === "list"
                const itemTextColor = selected && listFocused ? uiColors.accent : uiColors.textPrimary
                return (
                  <box
                    key={`${item.text}-${index}`}
                    flexDirection="row"
                    backgroundColor={selected && listFocused ? uiColors.modalAccentBackground : uiColors.modalBackground}
                  >
                    <text fg={item.done ? uiColors.sidebarTitle : uiColors.textPrimary}>
                      {item.done ? "[x]" : "[ ]"}
                    </text>
                    <box width={1} />
                    <text fg={itemTextColor}>{item.text}</text>
                  </box>
                )
              })
            : null}
        </box>

        <input
          ref={inputRef}
          width="100%"
          value={draftInput}
          onChange={onDraftChange}
          onSubmit={onSubmit}
          focused={focusedSection === "input" && !loading}
          placeholder="Add feature or bug to fix"
          backgroundColor={focusedSection === "input" ? uiColors.modalAccentBackground : uiColors.modalBackground}
          textColor={uiColors.textPrimary}
          marginTop={uiLayout.modalHeaderBodyGap}
        />
      </box>
    </box>
  )
}
