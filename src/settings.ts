import { promises as fs } from "fs";
import path from "path";

export type KeyBindingAction =
  | "openFile"
  | "saveFile"
  | "saveAs"
  | "newFile"
  | "quit"
  | "refreshTree"
  | "reloadTheme"
  | "toggleFocus"
  | "toggleFileTree"
  | "cancel"
  | "quitConfirmYes"
  | "quitConfirmNo";

export interface SeedSettings {
  keybindings: Record<KeyBindingAction, string>;
}

export interface LoadSettingsResult {
  settings: SeedSettings;
  warning: string | null;
}

export const defaultSettings: SeedSettings = {
  keybindings: {
    openFile: "ctrl+o",
    saveFile: "ctrl+s",
    saveAs: "ctrl+shift+s",
    newFile: "ctrl+n",
    quit: "ctrl+q",
    refreshTree: "ctrl+r",
    reloadTheme: "ctrl+t",
    toggleFocus: "tab",
    toggleFileTree: "ctrl+f",
    cancel: "escape",
    quitConfirmYes: "y",
    quitConfirmNo: "n",
  },
};

export function normalizeCombo(combo: string): string {
  return combo
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "+");
}

function canonicalizeCombo(combo: string): string {
  const normalized = normalizeCombo(combo).replace(/\breturn\b/g, "enter");
  return normalized;
}

export function keyToCombo(key: { name?: string; ctrl?: boolean; shift?: boolean; meta?: boolean; option?: boolean }): string {
  const parts: string[] = [];
  if (key.ctrl) parts.push("ctrl");
  if (key.shift) parts.push("shift");
  if (key.meta || key.option) parts.push("meta");
  if (key.name) parts.push(String(key.name).toLowerCase());
  return parts.join("+");
}

export function keyMatchesBinding(
  key: { name?: string; ctrl?: boolean; shift?: boolean; meta?: boolean; option?: boolean },
  binding: string
): boolean {
  return canonicalizeCombo(keyToCombo(key)) === canonicalizeCombo(binding);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeSettings(raw: unknown): SeedSettings {
  const merged: SeedSettings = {
    keybindings: { ...defaultSettings.keybindings },
  };

  if (!isPlainObject(raw)) {
    return merged;
  }

  const keybindings = raw.keybindings;
  if (!isPlainObject(keybindings)) {
    return merged;
  }

  for (const [action, combo] of Object.entries(keybindings)) {
    if (typeof combo !== "string") continue;
    if (Object.prototype.hasOwnProperty.call(merged.keybindings, action)) {
      const typedAction = action as KeyBindingAction;
      merged.keybindings[typedAction] = normalizeCombo(combo);
    }
  }

  return merged;
}

export async function loadGlobalSettings(homeDir: string): Promise<LoadSettingsResult> {
  const settingsPath = path.join(homeDir, ".seed");
  try {
    const rawText = await fs.readFile(settingsPath, "utf-8");
    const parsed = JSON.parse(rawText);
    return {
      settings: mergeSettings(parsed),
      warning: null,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        settings: defaultSettings,
        warning: null,
      };
    }

    return {
      settings: defaultSettings,
      warning: "Invalid ~/.seed config. Using default keybindings.",
    };
  }
}
