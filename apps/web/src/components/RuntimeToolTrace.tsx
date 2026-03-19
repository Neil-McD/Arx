import { useMemo } from "react";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";
import { buildRuntimeToolTraceGroups } from "../../../../shared/runtimeToolTraceUi";

function splitTraceLinkTitle(title: string): { prefix: string | null; linkText: string } {
  const separatorIndex = title.indexOf(": ");
  if (separatorIndex < 0) {
    return { prefix: null, linkText: title };
  }
  return {
    prefix: title.slice(0, separatorIndex + 1),
    linkText: title.slice(separatorIndex + 2),
  };
}

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
                    {call.href ? (
                      (() => {
                        const { prefix, linkText } = splitTraceLinkTitle(call.title);
                        return (
                          <>
                            {prefix ? <span className="runtime-tool-trace-title">{prefix} </span> : null}
                            <a
                              className="runtime-tool-trace-title runtime-tool-trace-link"
                              href={call.href}
                              target="_blank"
                              rel="noreferrer noopener"
                              title={call.href}
                            >
                              {linkText}
                            </a>
                          </>
                        );
                      })()
                    ) : (
                      <span className="runtime-tool-trace-title">{call.title}</span>
                    )}
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
