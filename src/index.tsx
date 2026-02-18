import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./components/App.js";
import { ThemeProvider } from "./theme-context.js";

async function main() {
  try {
    const renderer = await createCliRenderer({
      exitOnCtrlC: false,
    });

    // Get current working directory
    const initialDir = process.cwd();

    createRoot(renderer).render(
      <ThemeProvider>
        <App initialDir={initialDir} />
      </ThemeProvider>
    );
  } catch (error) {
    console.error("Failed to start editor:", error);
    process.exit(1);
  }
}

main();
