import { useEffect, useMemo, useRef } from "react";

import type { AuthSession } from "../auth";
import { resolveAuthSubject } from "../../../../shared/authSession";
import { identifyCloudBusinessVisitor } from "../../../../shared/cloudBusinessAnalyticsGateway";

export function useWebAuthenticatedIdentityController(
  session: AuthSession | null,
) {
  const canonicalUserId = useMemo(
    () => resolveAuthSubject(session),
    [session?.access_token, session?.id_token, session?.user?.id],
  );
  const lastIdentifiedBusinessVisitorSubjectRef = useRef<string | null>(null);

  useEffect(() => {
    const subject = String(canonicalUserId ?? "").trim();
    if (!session || !subject) {
      lastIdentifiedBusinessVisitorSubjectRef.current = null;
      return;
    }
    if (lastIdentifiedBusinessVisitorSubjectRef.current === subject) return;
    lastIdentifiedBusinessVisitorSubjectRef.current = subject;
    void identifyCloudBusinessVisitor({ session }).catch((error) => {
      if (lastIdentifiedBusinessVisitorSubjectRef.current === subject) {
        lastIdentifiedBusinessVisitorSubjectRef.current = null;
      }
      console.warn("Failed to identify business visitor:", error);
    });
  }, [canonicalUserId, session]);

  return { canonicalUserId };
}
