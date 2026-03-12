type RuntimeApiExample = {
  label: string;
  code: string;
};

type RuntimeApiDisclosureProps = {
  title?: string;
  description?: string;
  examples: RuntimeApiExample[];
};

export function RuntimeApiDisclosure({
  title = "Runtime API examples",
  description,
  examples,
}: RuntimeApiDisclosureProps) {
  if (examples.length === 0) {
    return null;
  }

  return (
    <details className="runtime-api-disclosure">
      <summary>
        <span>{title}</span>
      </summary>
      <div className="runtime-api-body">
        {description ? <p>{description}</p> : null}
        <div className="runtime-api-grid">
          {examples.map((example) => (
            <article key={example.label} className="runtime-api-card">
              <strong>{example.label}</strong>
              <pre>
                <code>{example.code}</code>
              </pre>
            </article>
          ))}
        </div>
      </div>
    </details>
  );
}
