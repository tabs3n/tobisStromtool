import { useState } from 'react';
import type { Issue } from '../lib/calc';

/**
 * Hinweise liegen als fixiertes Overlay über dem Inhalt und nicht im Layoutfluss –
 * dadurch verschiebt sich beim Tippen nichts, wenn Meldungen kommen und gehen.
 */
export function IssueDock({ issues }: { issues: Issue[] }) {
  const [open, setOpen] = useState(false);
  if (issues.length === 0) return null;

  const errors = issues.filter((i) => i.level === 'error').length;
  const warns = issues.length - errors;

  return (
    <div className="issue-dock">
      {open && (
        <div className="issue-panel">
          {issues.map((i, n) => (
            <div className={`issue ${i.level}`} key={n}>
              <span className="scope">{i.scope}</span>
              <span>{i.message}</span>
            </div>
          ))}
        </div>
      )}
      <button
        className={`issue-toggle ${errors > 0 ? 'error' : 'warn'}`}
        onClick={() => setOpen((v) => !v)}
        title={open ? 'Hinweise ausblenden' : 'Hinweise anzeigen'}
      >
        {errors > 0 && <span className="dot err" />}
        {errors > 0 && `${errors} Fehler`}
        {errors > 0 && warns > 0 && ' · '}
        {warns > 0 && <span className="dot wrn" />}
        {warns > 0 && `${warns} Warnung${warns === 1 ? '' : 'en'}`}
        <span className="caret">{open ? '▾' : '▴'}</span>
      </button>
    </div>
  );
}
