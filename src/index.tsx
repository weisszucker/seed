import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"

import { App } from "./ui/App"

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  autoFocus: true,
  useMouse: true,
})

createRoot(renderer).render(<App />)
