export const uiLayout = {
  editorMaxColumns: 100,
  editorWidthPercent: "66%",
  sidebarWidthPercent: "34%",
  sidebarRatioToEditor: 34 / 66,
  appPadding: 1,
  panelPaddingX: 2,
  panelPaddingY: 1,
  panelOuterMarginX: 1,
  rowGap: 1,
  statusMarginTop: 1,
  modalWidth: 56,
  modalActionWidth: 12,
  modalZIndex: 100,
  modalHeaderBodyGap: 2,
} as const

export const uiColors = {
  appBackground: "#0f1318",
  panelBackground: "#1b1f26",
  textPrimary: "#d7dbe0",
  textMuted: "#9ca2ab",
  textSubtle: "#bcc2ca",
  editorTitle: "#acc8de",
  sidebarTitle: "#9dbb9d",
  treeDefault: "#c3c9d2",
  treeDisabled: "#7c818a",
  treeSelectedBackground: "#353024",
  accent: "#e2bf88",
  danger: "#cc8383",
  modalBackground: "#252932",
  modalAccentBackground: "#353024",
  modalBorder: "#bb8f66",
} as const

export const syntaxColors = {
  plain: "#c9ced5",
  inlineCode: "#cfb381",
  link: "#84b8d9",
  linkUrl: "#9ad0f2",
  bold: "#e2bf88",
  italic: "#b99bbf",
  codeFence: "#7aa8cc",
  codeBlock: "#abc6db",
  heading: "#88c0aa",
  quote: "#95b086",
  list: "#b3c5a6",
  keyword: "#d8a676",
  type: "#8fb7d3",
  string: "#c4cf95",
  number: "#d9a6a6",
  operator: "#c9ced5",
  punctuation: "#8d949d",
  constant: "#d6ba8a",
  variable: "#d7dbe0",
  label: "#acc8de",
} as const

export function getContentMaxWidth(sidebarVisible: boolean): number {
  const maxWidthWithSidebar = Math.round(uiLayout.editorMaxColumns * (1 + uiLayout.sidebarRatioToEditor))
  return sidebarVisible ? maxWidthWithSidebar : uiLayout.editorMaxColumns
}
