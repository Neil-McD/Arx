import { useEffect, useState } from "react";

// After signing out you land on the home page with "?signed-out". This reads
// it once, takes it out of the address, and shows a short note for a few
// seconds, so the jump to the home page isn't a silent reset (Neil, Nov 26).
export const SIGNED_OUT_MARKER = "signed-out";

export function takeSignedOutMarker(): boolean {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(SIGNED_OUT_MARKER)) return false;
  url.searchParams.delete(SIGNED_OUT_MARKER);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}

export function SignedOutNote(props: { show: boolean }) {
  const [visible, setVisible] = useState(props.show);
  useEffect(() => {
    if (!props.show) return;
    const timer = window.setTimeout(() => setVisible(false), 3200);
    return () => window.clearTimeout(timer);
  }, [props.show]);
  if (!visible) return null;
  return <p className="signed-out-note" role="status">You're signed out.</p>;
}
