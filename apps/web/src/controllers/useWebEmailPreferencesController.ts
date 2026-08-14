import { useCallback, useEffect, useState } from "react";

import {
  loadCloudEmailPreferences,
  updateCloudWeeklyDigestPreference,
} from "../../../../shared/cloudEmailPreferencesGateway";
import type { AuthSession } from "../auth";

export function useWebEmailPreferencesController(params: {
  session: AuthSession | null;
  isEnabled: boolean;
}) {
  const [weeklyDigestEnabled, setWeeklyDigestEnabled] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!params.session || !params.isEnabled) {
      setWeeklyDigestEnabled(false);
      setHasLoaded(false);
      setIsLoading(false);
      setIsSaving(false);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    setHasLoaded(false);
    setIsLoading(true);
    setError(null);
    void loadCloudEmailPreferences({ session: params.session })
      .then((preferences) => {
        if (!cancelled) {
          setWeeklyDigestEnabled(preferences.weekly_digest_enabled);
          setHasLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Polynet could not load your email preference.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.isEnabled, params.session]);

  const updateWeeklyDigestEnabled = useCallback(
    async (enabled: boolean): Promise<void> => {
      if (!params.session || !hasLoaded || isLoading || isSaving) return;
      const previous = weeklyDigestEnabled;
      setWeeklyDigestEnabled(enabled);
      setIsSaving(true);
      setError(null);
      try {
        const preferences = await updateCloudWeeklyDigestPreference({
          session: params.session,
          enabled,
        });
        setWeeklyDigestEnabled(preferences.weekly_digest_enabled);
      } catch {
        setWeeklyDigestEnabled(previous);
        setError("Polynet could not save your email preference. Try again.");
      } finally {
        setIsSaving(false);
      }
    }, [hasLoaded, isLoading, isSaving, params.session, weeklyDigestEnabled],
  );

  return {
    weeklyDigestEnabled,
    hasLoaded,
    isLoading,
    isSaving,
    error,
    updateWeeklyDigestEnabled,
  };
}
