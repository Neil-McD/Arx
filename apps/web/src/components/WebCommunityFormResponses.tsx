import { useEffect, useState } from "react";
import type { CommunityFormsGateway } from "../controllers/useWebCommunityFormsGateway";
export function WebCommunityFormResponses({ gateway, membershipId, evidenceKey }: { gateway: CommunityFormsGateway; membershipId: string; evidenceKey: string }) {
  const [page, setPage] = useState<Awaited<ReturnType<NonNullable<CommunityFormsGateway["responses"]>>> | null>(null);
  const [state, setState] = useState("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => { let alive = true;
    setState(previous => previous === "ready" || previous === "refreshing" ? "refreshing" : "loading");
    if (!gateway.responses) { setPage(null); setState("error"); return; }
    gateway.responses(membershipId).then(r => { if (alive) { setPage(r); setState("ready"); } }).catch(() => { if (alive) { setPage(null); setState("error"); } });
    return () => { alive = false; };
  }, [gateway, membershipId, evidenceKey, retry]);
  const rows = page?.rows ?? [];
  return <section className="workflow-member-dossier-section workflow-form-responses"><h3>Form responses</h3>
    {state === "refreshing" ? <p role="status">Updating responses…</p> : null}
    {state === "ready" && page?.truncated ? <p role="status">Some responses are omitted from this view.</p> : null}
    {state === "ready" && Boolean(page?.unavailable_records) ? <p role="status">Some responses could not be verified and are unavailable.</p> : null}
    {state === "loading" ? <p>Loading responses…</p> : state === "error" ? <button onClick={() => setRetry(n => n + 1)}>Retry responses</button> : !rows.length ? <p>{page?.truncated || page?.unavailable_records ? "No verified responses in this view." : "No submitted forms in this membership activation."}</p> : rows.map(row => <details key={row.id}><summary>{row.form?.name ?? "Form"} · {new Date(row.submittedAt!).toLocaleDateString()}</summary><dl>{row.form?.questions.map(q => {
    const answer = row.answers[q.key];
    const display = q.type.endsWith("choice") ? (Array.isArray(answer) ? answer : answer === undefined || answer === "" ? [] : [answer]).map(v => q.options[Number(v)]).join(", ") : answer;
    return <div key={q.key}><dt>{q.title}</dt><dd>{display || "Not answered"}</dd></div>;
  })}</dl></details>)}</section>;
}
