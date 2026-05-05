import type { HistoryEntry } from "../types";

interface Props {
  entry: HistoryEntry;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatDuration(startedAt?: string, finishedAt?: string | null): string {
  const started = Date.parse(startedAt || "");
  const finished = Date.parse(finishedAt || "");

  if (Number.isNaN(started) || Number.isNaN(finished)) return "-";

  const duration = finished - started;
  return duration < 1000 ? `${duration} ms` : `${(duration / 1000).toFixed(1)} s`;
}

export function StepsTab({ entry }: Props) {
  const steps = entry.steps || [];

  return (
    <section className="detail-section">
      <h2>Generation steps</h2>
      {steps.length === 0 ? (
        <p className="muted">No steps recorded for this trace.</p>
      ) : (
        <div className="steps-list">
          {steps.map((step, index) => {
            const status = step.success === false ? "error" : "success";

            return (
              <article className="step-row" key={`${step.name || step.label}-${index}`}>
                <span className={`badge ${status}`}>{status}</span>
                <div>
                  <strong>{step.label || step.name || "Step"}</strong>
                  <span>
                    {formatDate(step.startedAt)} - {formatDate(step.finishedAt)}
                  </span>
                </div>
                <span>{formatDuration(step.startedAt, step.finishedAt)}</span>
                {step.error ? <p className="step-error">{step.error}</p> : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
