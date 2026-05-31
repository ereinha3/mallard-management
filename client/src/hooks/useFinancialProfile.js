// Drop this file into client/src/hooks/useFinancialProfile.js
import { useState, useEffect, useCallback } from "react";
import { fetchFinancialProfile } from "../api/mallardClient";

/**
 * Hook that fetches the full financial profile from Gilbert's backend.
 *
 * Usage in Dashboard.jsx:
 *   const { data, loading, error, refresh } = useFinancialProfile(userProfile);
 *
 * @param {object|null} profileInput — the user's financial profile input object.
 *   Pass null to skip the fetch (e.g., while the user is still filling out the form).
 */
export function useFinancialProfile(profileInput) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const profileInputKey = JSON.stringify(profileInput);

  const load = useCallback(async () => {
    if (!profileInput) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFinancialProfile(profileInput);
      setData(result);
    } catch (err) {
      setError(err.message ?? "Failed to load financial profile");
    } finally {
      setLoading(false);
    }
  }, [profileInput]);

  useEffect(() => {
    void profileInputKey;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, profileInputKey]); // re-fetch when input changes

  return { data, loading, error, refresh: load };
}
