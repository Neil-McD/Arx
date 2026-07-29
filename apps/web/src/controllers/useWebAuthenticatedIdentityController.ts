import { useEffect, useMemo, useRef, useState } from "react";

import type { AuthSession } from "../auth";
import { resolveAuthSubject } from "../../../../shared/authSession";
import { identifyCloudBusinessVisitor } from "../../../../shared/cloudBusinessAnalyticsGateway";
import { loadOptionalOperatorAccessCanonical } from "../../../../shared/cloudOperatorDashboardGateway";
import type { OperatorAccessSnapshot } from "../../../../shared/operatorTypes";

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

  const [operatorAccessState, setOperatorAccessState] = useState<{
    subject: string;
    access: OperatorAccessSnapshot | null;
  } | null>(null);
  const isOperatorAccessResolved =
    Boolean(canonicalUserId)
    && operatorAccessState?.subject === canonicalUserId;
  const operatorAccess =
    isOperatorAccessResolved ? operatorAccessState?.access ?? null : null;

  useEffect(() => {
    let isAlive = true;
    const subject = String(canonicalUserId ?? "").trim();
    if (!session || !subject) {
      setOperatorAccessState(null);
      return;
    }

    loadOptionalOperatorAccessCanonical({ session }).then(
      (access) => {
        if (!isAlive) return;
        setOperatorAccessState({ subject, access: access ?? null });
      },
      (error) => {
        if (!isAlive) return;
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes("operator_access_forbidden")
          || message.includes("operator_access_identity_mismatch")
        ) {
          setOperatorAccessState({ subject, access: null });
          return;
        }
        console.warn("Failed to resolve operator access:", error);
        setOperatorAccessState({ subject, access: null });
      },
    );
    return () => {
      isAlive = false;
    };
  }, [canonicalUserId, session]);

  return {
    canonicalUserId,
    isOperatorAccessResolved,
    operatorAccess,
    hasOperatorAccess: Boolean(session && operatorAccess),
  };
}
