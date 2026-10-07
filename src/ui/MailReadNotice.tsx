export function MailReadNotice({
  ids,
  busy,
  onRetry,
}: {
  ids: string[];
  busy: boolean;
  onRetry: () => void;
}) {
  if (!ids.length) return null;
  return (
    <div className="mail-read-notice" role="status">
      <strong>
        {ids.length} {ids.length === 1 ? "letter could" : "letters could"} not
        be read.
      </strong>
      <p>
        You can read any letters that loaded safely. Mail that could not load or
        pass verification is hidden here. Refresh to try another read.
      </p>
      <button disabled={busy} onClick={onRetry}>
        Retry unavailable mail
      </button>
      <details>
        <summary>Which letters?</summary>
        <ul>
          {ids.map((id) => (
            <li key={id}>
              <code>{id}</code>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
