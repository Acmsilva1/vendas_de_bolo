type Status = { isPostgres: boolean; message: string };

export function databaseReadiness(initialize: () => Promise<Status>, retryMs = 1000, now = Date.now) {
  let inFlight: Promise<Status> | null = null;
  let status: Status | null = null;
  let retryAt = 0;
  return async (): Promise<Status> => {
    if (status?.isPostgres || (status && now() < retryAt)) return status;
    if (!inFlight) {
      inFlight = initialize().then(result => {
        status = result;
        if (!result.isPostgres) retryAt = now() + retryMs;
        return result;
      }).finally(() => { inFlight = null; });
    }
    return inFlight;
  };
}
