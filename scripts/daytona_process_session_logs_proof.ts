import { strict as assert } from "node:assert";
import { normalizeDaytonaProcessSessionCommandLogsPayload } from "../shared/daytonaProcessSessionLogs.ts";

const markerLine = 'POLYNET_CODEX_HARNESS_EVENT {"type":"assistant_delta","delta":"ok"}';

{
  const logs = normalizeDaytonaProcessSessionCommandLogsPayload({
    stdout: "stdout only",
    stderr: "stderr only",
  });
  assert.equal(logs.stdout, "stdout only");
  assert.equal(logs.stderr, "stderr only");
  assert.equal(logs.output, "stdout only\nstderr only");
}

{
  const logs = normalizeDaytonaProcessSessionCommandLogsPayload({
    logs: markerLine,
  });
  assert.equal(logs.output, markerLine);
}

{
  const logs = normalizeDaytonaProcessSessionCommandLogsPayload(markerLine);
  assert.equal(logs.output, markerLine);
}

{
  const logs = normalizeDaytonaProcessSessionCommandLogsPayload(null, markerLine);
  assert.equal(logs.output, markerLine);
}

{
  const logs = normalizeDaytonaProcessSessionCommandLogsPayload({
    data: [{ stdout: "chunk one" }, { stderr: "chunk two" }],
  });
  assert.equal(logs.output, "chunk one\nchunk two");
}

console.log("daytona_process_session_logs_proof: ok");
