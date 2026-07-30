import { useStore } from '../store';
import { fmtW, type ProjectResult } from '../lib/calc';
import { pickProjectFile, saveProjectFile } from '../lib/projectFile';
import { exportPlanPdf } from '../lib/pdf';
import { TextInput } from './ui';

export function TopBar({ result }: { result: ProjectResult }) {
  const project = useStore((s) => s.project);
  const patchProject = useStore((s) => s.patchProject);
  const replaceProject = useStore((s) => s.replaceProject);
  const newProject = useStore((s) => s.newProject);

  const errors = result.issues.filter((i) => i.level === 'error').length;
  const warns = result.issues.filter((i) => i.level === 'warn').length;

  return (
    <div className="topbar">
      <span className="brand">STROMTOOL</span>
      <TextInput
        className="inline"
        value={project.name}
        onChange={(name) => patchProject({ name })}
        placeholder="Projektname"
        style={{ fontWeight: 600, fontSize: 14, width: 200 }}
      />
      <TextInput
        className="inline"
        value={project.venue}
        onChange={(venue) => patchProject({ venue })}
        placeholder="Location"
        style={{ width: 150, color: 'var(--text-2)' }}
      />
      <TextInput
        className="inline"
        value={project.date}
        onChange={(date) => patchProject({ date })}
        placeholder="Datum"
        style={{ width: 100, color: 'var(--text-2)' }}
      />

      <span className="spacer" />

      <span className="badge" title="Gesamtleistung aller Verteiler">
        {fmtW(result.watt)}
      </span>
      <span className="badge" title="Anzahl Verbraucher">
        {result.fixtureCount} Stk.
      </span>
      {errors > 0 && (
        <span className="badge error" title="Fehler">
          {errors} Fehler
        </span>
      )}
      {warns > 0 && (
        <span className="badge warn" title="Warnungen">
          {warns} Warnungen
        </span>
      )}

      <button
        className="btn"
        onClick={() => {
          if (confirm('Neues Projekt anlegen? Nicht gespeicherte Änderungen gehen verloren.')) newProject();
        }}
      >
        Neu
      </button>
      <button
        className="btn"
        onClick={() => pickProjectFile(replaceProject, (msg) => alert(`Datei konnte nicht geladen werden:\n${msg}`))}
      >
        Öffnen
      </button>
      <button className="btn" onClick={() => saveProjectFile(project)}>
        Speichern
      </button>
      <button className="btn primary" onClick={() => exportPlanPdf(project)}>
        PDF-Export
      </button>
    </div>
  );
}
