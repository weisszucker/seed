export async function pollUntil(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 5000,
  intervalMs = 10,
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() <= deadline) {
    if (await predicate()) {
      return
    }

    await Bun.sleep(intervalMs)
  }

  throw new Error(`Timed out after ${timeoutMs}ms`)
}

export async function observeFor(
  durationMs: number,
  observer: () => Promise<void> | void,
  intervalMs = 10,
): Promise<void> {
  const deadline = Date.now() + durationMs

  while (Date.now() <= deadline) {
    await observer()

    if (Date.now() > deadline) {
      return
    }

    await Bun.sleep(intervalMs)
  }
}
