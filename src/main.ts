import { runCli } from "./cli"
import { initializeDiagnosticsLog } from "./diagnostics/logging"

initializeDiagnosticsLog()
await runCli(process.argv.slice(2))
