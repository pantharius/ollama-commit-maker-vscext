import { postMessage } from "../vscode";
import type { HistoryEntry } from "../types";
import type { ReactNode } from "react";

interface Props {
  entry: HistoryEntry;
}

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="detail-section">
      <div className="section-heading">
        <h2>{title}</h2>
        {actions ? <div className="section-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function PromptTab({ entry }: Props) {
  return (
    <div className="detail-stack">
      <Section title="System prompt">
        <pre className="code-block">{entry.prompt?.system || "<empty>"}</pre>
      </Section>
      <Section title="User prompt">
        <pre className="code-block">{entry.prompt?.user || "<empty>"}</pre>
      </Section>
      <Section
        title="Full prompt"
        actions={
          <button type="button" onClick={() => postMessage({ type: "copyPrompt", id: entry.id })}>
            Copy prompt
          </button>
        }
      >
        <pre className="code-block">{entry.prompt?.full || "<empty>"}</pre>
      </Section>
      {entry.output?.rawResponse ? (
        <Section
          title="Raw response"
          actions={
            <button type="button" onClick={() => postMessage({ type: "copyRawResponse", id: entry.id })}>
              Copy raw response
            </button>
          }
        >
          <pre className="code-block">{entry.output.rawResponse}</pre>
        </Section>
      ) : null}
    </div>
  );
}
