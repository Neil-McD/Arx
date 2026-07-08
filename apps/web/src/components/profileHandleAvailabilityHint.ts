/* One status→hint mapping for profile-handle availability, shared by every
   surface that shows it (onboarding modal, bridge card). Surfaces keep their
   own copy tables; the branching lives here once. */

export type ProfileHandleAvailabilityLike = {
  available: boolean;
  status: "empty" | "too_short" | "too_long" | "invalid_format" | "reserved" | "available" | "taken";
  handle: string | null;
  normalized_handle: string | null;
};

export type ProfileHandleHint = {
  kind: "idle" | "checking" | "success" | "error";
  label: string;
};

export type ProfileHandleHintCopy = {
  empty: string;
  checking: string;
  unknown: string;
  available: (handle: string) => string;
  taken: string;
  reserved: string;
  tooShort: string;
  tooLong: string;
  invalidFormat: string;
};

export function formatProfileHandleAvailabilityHint(args: {
  handle: string;
  availability: ProfileHandleAvailabilityLike | null;
  isChecking: boolean;
  copy: ProfileHandleHintCopy;
}): ProfileHandleHint {
  const { availability, copy } = args;
  const trimmed = args.handle.trim();
  if (!trimmed) return { kind: "idle", label: copy.empty };
  if (args.isChecking) return { kind: "checking", label: copy.checking };
  if (!availability) return { kind: "idle", label: copy.unknown };
  if (availability.status === "available") {
    return { kind: "success", label: copy.available(availability.handle ?? trimmed) };
  }
  if (availability.status === "taken") return { kind: "error", label: copy.taken };
  if (availability.status === "reserved") return { kind: "error", label: copy.reserved };
  if (availability.status === "too_short") return { kind: "error", label: copy.tooShort };
  if (availability.status === "too_long") return { kind: "error", label: copy.tooLong };
  if (availability.status === "invalid_format") return { kind: "error", label: copy.invalidFormat };
  return { kind: "idle", label: copy.empty };
}
