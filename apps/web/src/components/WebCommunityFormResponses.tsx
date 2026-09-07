import { useEffect, useState } from "react";
import type { CommunityFormsGateway } from "../controllers/useWebCommunityFormsGateway";
export function WebCommunityFormResponses({ gateway, membershipId }: { gateway: CommunityFormsGateway; membershipId: string }) {
  const [rows, setRows] = useState<Awaited<ReturnType<NonNullable<CommunityFormsGateway["responses"]>>>>([]);
  const [state, setState] = useState("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => { let alive = true; setRows([]); setState("loading");
    gateway.responses?.(membershipId).then(r => { if (alive) { setRows(r); setState("ready"); } }).catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [gateway, membershipId, retry]);
  return <section><h3>Form responses</h3>{state === "loading" ? <p>Loading responses…</p> : state === "error" ? <button onClick={() => setRetry(n => n + 1)}>Retry responses</button> : !rows.length ? <p>No submitted forms.</p> : rows.map(row => <details key={row.id}><summary>{row.form?.name ?? "Form"} · {new Date(row.submittedAt!).toLocaleDateString()}</summary><dl>{row.form?.questions.map(q => {
    const answer = row.answers[q.key];
    const display = q.type.endsWith("choice") ? (Array.isArray(answer) ? answer : answer === undefined || answer === "" ? [] : [answer]).map(v => q.options[Number(v)]).join(", ") : answer;
    return <div key={q.key}><dt>{q.title}</dt><dd>{display || "Not answered"}</dd></div>;
  })}</dl></details>)}</section>;
}
