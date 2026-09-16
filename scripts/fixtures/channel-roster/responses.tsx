import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { WebCommunityFormResponses } from '../../../apps/web/src/components/WebCommunityFormResponses';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const container = document.getElementById('fixture')!;
const root = createRoot(container);
const output = document.getElementById('results')!;
const pending: Array<{ resolve: (value: any) => void; reject: (error: Error) => void }> = [];
const gateway: any = { scopeKey: 'community:owner', responses: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) };
const page = (ids: string[]) => ({ rows: ids.map(id => ({ id, answers: { q: `answer-${id}` }, submittedAt: 1, form: { name: id, questions: [{ key: 'q', title: 'Question', type: 'short_text', options: [] }] } })), truncated: false, unavailable_records: 0 });
let evidence = 'none', member = 'member';
const render = () => act(async () => root.render(<WebCommunityFormResponses key={member} gateway={gateway} membershipId={member} evidenceKey={evidence} />));
const check = (condition: unknown, name: string) => { if (!condition) throw new Error(name); output.textContent += `PASS ${name}\n`; };
document.getElementById('run')!.onclick = async () => {
  output.textContent = '';
  try {
    await render(); await act(async () => pending.shift()!.resolve(page([])));
    check(container.textContent?.includes('No submitted forms'), 'initial empty state');
    evidence = 'first'; await render(); await act(async () => pending.shift()!.resolve(page(['first'])));
    check(container.textContent?.includes('answer-first'), 'new evidence fetches full response without remount');
    const detail = container.querySelector('details')!; detail.open = true;
    evidence = 'second'; await render();
    check(container.querySelector('details') === detail && detail.open, 'pending refresh retains open disclosure and answers');
    await act(async () => pending.shift()!.resolve(page(['second', 'first'])));
    check(container.textContent?.includes('answer-second') && detail.open, 'fresh response arrives without collapsing existing disclosure');
    evidence = 'third'; await render(); const old = pending.shift()!;
    evidence = 'fourth'; await render(); await act(async () => pending.shift()!.resolve(page(['fourth'])));
    await act(async () => old.resolve(page(['stale'])));
    check(!container.textContent?.includes('answer-stale'), 'late superseded read cannot restore stale answers');
    evidence = 'denied'; await render(); await act(async () => pending.shift()!.reject(new Error('access denied')));
    check(!container.textContent?.includes('answer-fourth') && container.textContent?.includes('Retry responses'), 'read denial clears private answers');
    evidence = 'new'; member = 'other'; await render();
    check(!container.textContent?.includes('answer-'), 'membership switch starts without prior private answers');
    await act(async () => pending.shift()!.resolve(page(['other'])));
    check(container.textContent?.includes('answer-other'), 'new member receives only its own response');
    output.textContent += 'ALL CHECKS PASSED';
  } catch (error) { output.textContent += `FAIL ${error}`; }
};
