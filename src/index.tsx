import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./components/App.js";
import { ThemeProvider } from "./theme-context.js";
import { loadGlobalSettings } from "./settings.js";

async function main() {
  try {
    const renderer = await createCliRenderer({
      exitOnCtrlC: false,
    });

    // Get current working directory
    const initialDir = process.cwd();
    const homeDir = process.env.HOME || process.cwd();
    const { settings, warning } = await loadGlobalSettings(homeDir);

    createRoot(renderer).render(
      <ThemeProvider>
        <App initialDir={initialDir} settings={settings} settingsWarning={warning} />
      </ThemeProvider>
    );
  } catch (error) {
    console.error("Failed to start editor:", error);
    process.exit(1);
  }
}

main();
