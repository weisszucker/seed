import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./components/App.js";

async function main() {
  try {
    const renderer = await createCliRenderer();

    // Get current working directory
    const initialDir = process.cwd();

    createRoot(renderer).render(<App initialDir={initialDir} />);
  } catch (error) {
    console.error("Failed to start editor:", error);
    process.exit(1);
  }
}

main();