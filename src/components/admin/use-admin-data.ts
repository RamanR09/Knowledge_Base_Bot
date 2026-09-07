"use client";

import * as React from "react";

interface AdminData<T> {
  /** null while the first load is in flight. */
  data: T | null;
  error: string | null;
  reload: () => void;
}

/** Small fetch-on-mount hook for the admin tabs (each tab remounts on activation). */
export function useAdminData<T>(url: string): AdminData<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Promise-callback style keeps setState out of the effect's direct call path.
  const load = React.useCallback(() => {
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<T>;
      })
      .then((payload) => {
        setData(payload);
        setError(null);
      })
      .catch(() => {
        setError("Failed to load. Check your connection and try again.");
      });
  }, [url]);

  React.useEffect(() => {
    load();
  }, [load]);

  return { data, error, reload: load };
}
