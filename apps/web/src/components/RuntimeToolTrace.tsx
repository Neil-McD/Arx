import { useMemo } from "react";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";
import { buildRuntimeToolTraceGroups } from "../../../../shared/runtimeToolTraceUi";

export function RuntimeToolTrace(props: {
  events: ThreadStreamingRuntimeEvent[];
}): JSX.Element | null {
  const groups = useMemo(() => buildRuntimeToolTraceGroups(props.events as any), [props.events]);
  if (groups.length === 0) return null;

  return (
    <div className="runtime-tool-stack">
      {groups.map((group) => (
        <details
          key={group.id}
          className="runtime-tool-trace"
        >
          <summary className="runtime-tool-trace-summary">
            <span className="runtime-tool-trace-toggle">{group.title}</span>
          </summary>
          <div className="runtime-tool-trace-stack">
            {group.calls.map((call) => (
              <div key={call.id} className="runtime-tool-trace-item">
                <div className="runtime-tool-trace-item-row static">
                  <span className="runtime-tool-trace-copy">
                    <span className="runtime-tool-trace-title">{call.title}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
