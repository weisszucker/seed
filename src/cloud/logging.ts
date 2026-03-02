type CloudLogPayload = Record<string, unknown>

export function logCloudEvent(event: string, payload: CloudLogPayload = {}): void {
  const record = {
    namespace: "seed-cloud",
    event,
    at: new Date().toISOString(),
    ...payload,
  }
  console.error(JSON.stringify(record))
}
