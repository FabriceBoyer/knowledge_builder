export const CHECKPOINT_CHANGE_THRESHOLD = 100
export const CHECKPOINT_BYTES_THRESHOLD = 512_000

export function shouldCreateCheckpoint(changeCount: number, encodedBytes: number, pendingCount: number) {
  return pendingCount === 0 && (changeCount >= CHECKPOINT_CHANGE_THRESHOLD || encodedBytes >= CHECKPOINT_BYTES_THRESHOLD)
}
