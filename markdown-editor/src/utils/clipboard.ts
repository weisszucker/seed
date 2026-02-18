export function copyToClipboard(text: string): boolean {
  // Use OSC 52 escape sequence for clipboard
  // This works in most modern terminals including over SSH
  const osc52 = `\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`;
  
  try {
    process.stdout.write(osc52);
    return true;
  } catch {
    return false;
  }
}

export function getSelectedText(
  text: string,
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number
): string {
  const lines = text.split("\n");
  
  if (startLine === endLine) {
    // Single line selection
    return lines[startLine]?.substring(startCol, endCol) || "";
  }
  
  // Multi-line selection
  let selected = lines[startLine]?.substring(startCol) || "";
  
  for (let i = startLine + 1; i < endLine; i++) {
    selected += "\n" + (lines[i] || "");
  }
  
  selected += "\n" + (lines[endLine]?.substring(0, endCol) || "");
  
  return selected;
}