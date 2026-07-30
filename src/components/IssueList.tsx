import { useState } from 'react';
import type { Issue } from '../lib/calc';

export function IssueList({ issues }: { issues: Issue[] }) {
  const [open, setOpen] = useState(true);
  if (issues.length === 0) return null;

  const errors = issues.filter((i) => i.level === 'error').length;

  return (
    <div style={{ marginBottom: 14 }}>
      <button className="btn sm" onClick={() => setOpen((v) => !v)} style={{ marginBottom: 6 }}>
        {open ? '▾' : '▸'} {issues.length} Hinweis{issues.length === 1 ? '' : 'e'}
        {errors > 0 ? ` · ${errors} Fehler` : ''}
      </button>
      {open && (
        <div className="issues">
          {issues.map((i, n) => (
            <div className={`issue ${i.level}`} key={n}>
              <span className="scope">{i.scope}</span>
              <span>{i.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
