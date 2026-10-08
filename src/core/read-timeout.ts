// Bound read-only SDK requests. Never apply this helper to signing/submission:
// financial outcomes must keep their original journal and wallet request.
export const INDEXER_READ_TIMEOUT_MS = 15_000;
export async function readWithTimeout<T>(read: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error("The post office read timed out. Try the read again."),
            ),
          INDEXER_READ_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
