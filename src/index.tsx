import { startSeedApp } from "./app/start"
import { initializeDiagnosticsLog } from "./diagnostics/logging"

initializeDiagnosticsLog()
await startSeedApp()
