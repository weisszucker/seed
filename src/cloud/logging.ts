import { createSeedLogger, type Logger } from "../logging/logger"

type CloudLogPayload = Record<string, unknown>

export async function createCloudLogger(owner?: string, repo?: string): Promise<Logger> {
  return await createSeedLogger({
    component: "cloud",
    owner,
    repo,
  })
}

export function logCloudEvent(logger: Logger, event: string, payload: CloudLogPayload = {}): void {
  logger.info(event, payload)
}
