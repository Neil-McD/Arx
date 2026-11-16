import { resolveAuthSubject, type AuthSessionLike } from "./authSession";

// Pages load their data in effects keyed on the session they are given. The
// sign-in token renews every few minutes, and each renewal is a new session
// object, so every one of those effects ran again and several blanked what
// they showed first: panels flickered on their own.
//
// A page's lifetime is the signed-in person, not the token (see
// resolveAuthPresentationIdentity). pageSession() returns one object per
// person, kept up to date in place: its identity changes only when the person
// does, while calls made with it always carry the newest token.
const holders = new Map<string, Record<string, unknown>>();

export function pageSession<T extends object>(session: T | null | undefined): T | null {
  if (!session) return null;
  const subject = resolveAuthSubject(session as AuthSessionLike);
  if (!subject) return session;
  let holder = holders.get(subject);
  if (!holder) {
    // One person at a time is signed in; nobody else's holder is kept.
    holders.clear();
    holder = {};
    holders.set(subject, holder);
  }
  const next = session as Record<string, unknown>;
  for (const key of Object.keys(holder)) if (!(key in next)) delete holder[key];
  Object.assign(holder, next);
  return holder as T;
}
