import { useEffect, useRef } from "react";
import type { AppTheme } from "../../../../shared/theme";
import { fetchCloudMyDisplayPreferences, setCloudMyDisplayPreferences } from "../../../../shared/cloudProfilesGateway";
import { setMemberPickEverywhere, useMemberPickEverywhere } from "./communityLookPreference";

// Keeps a signed-in person's Light/Dark pick (and "Use my pick in every
// community") on their account, so it follows them to every device and their
// own agent can change it. The account's pick is read on
// sign-in and whenever the tab comes back into focus; a pick made here is saved
// to the account. Signed out, the browser's pick is all there is.
export function useAccountDisplayPreferences(params: {
  session: { user: { id: string } } | null | undefined;
  appTheme: AppTheme;
  setAppTheme: (theme: AppTheme) => void;
}) {
  const { session, appTheme, setAppTheme } = params;
  const everywhere = useMemberPickEverywhere();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  // What the account holds, as far as this tab knows. null until it's read.
  const synced = useRef<{ userId: string; theme: AppTheme; everywhere: boolean } | null>(null);
  const userId = session?.user.id ?? null;
  const current = useRef({ appTheme, everywhere });
  current.current = { appTheme, everywhere };

  useEffect(() => {
    synced.current = null;
    if (!userId || !sessionRef.current) return;
    let cancelled = false;
    const load = () => {
      const active = sessionRef.current;
      if (!active) return;
      fetchCloudMyDisplayPreferences({ session: active }).then((saved) => {
        if (cancelled) return;
        const theme = saved.theme ?? current.current.appTheme;
        const pickEverywhere = saved.look_everywhere ?? current.current.everywhere;
        synced.current = { userId, theme, everywhere: pickEverywhere };
        if (theme !== current.current.appTheme) setAppTheme(theme);
        if (pickEverywhere !== current.current.everywhere) setMemberPickEverywhere(pickEverywhere);
      }).catch(() => {
        // Offline or signed out mid-load: the browser's pick stands.
      });
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [userId, setAppTheme]);

  useEffect(() => {
    const known = synced.current;
    const active = sessionRef.current;
    if (!known || !active || known.userId !== userId) return;
    const theme = appTheme !== known.theme ? appTheme : undefined;
    const lookEverywhere = everywhere !== known.everywhere ? everywhere : undefined;
    if (theme === undefined && lookEverywhere === undefined) return;
    synced.current = { userId: known.userId, theme: appTheme, everywhere };
    setCloudMyDisplayPreferences({ session: active, theme, lookEverywhere }).catch(() => {
      // Kept in this browser; the next pick tries the account again.
      synced.current = known;
    });
  }, [appTheme, everywhere, userId]);
}
