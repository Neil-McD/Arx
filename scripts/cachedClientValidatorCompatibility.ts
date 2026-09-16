import { isDeepStrictEqual } from "node:util";

// Conservative structural inclusion: every payload accepted before must still
// be accepted. Handler behavior requires separate request/behavior tests.
export function acceptsPreviousValidator(candidate: any, previous: any): boolean {
  if (!candidate || !previous) return false;
  if (candidate.type === "any") return true;
  if (isDeepStrictEqual(candidate, previous)) return true;
  if (previous.type === "union") return previous.value.every((v: any) => acceptsPreviousValidator(candidate, v));
  if (candidate.type === "union") return candidate.value.some((v: any) => acceptsPreviousValidator(v, previous));
  if (candidate.type !== previous.type) return false;
  if (previous.type === "array") return acceptsPreviousValidator(candidate.value, previous.value);
  if (previous.type === "object") {
    const oldFields = previous.value, newFields = candidate.value;
    return Object.entries(oldFields).every(([name, old]: [string, any]) => {
      const next = newFields[name];
      return next && (!old.optional || next.optional) && acceptsPreviousValidator(next.fieldType, old.fieldType);
    }) && Object.entries(newFields).every(([name, next]: [string, any]) => oldFields[name] || next.optional);
  }
  return false;
}
