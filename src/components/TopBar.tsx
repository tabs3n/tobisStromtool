import { useState } from 'react';
import { useStore } from '../store';
import { cloudConfigured, createCloudProject, getPassword } from '../lib/cloud';
import { setCloudHash } from '../lib/useCloudSync';
import { fmtW, type ProjectResult } from '../lib/calc';
import { pickProjectFile, saveProjectFile } from '../lib/projectFile';
import { exportPlanPdf } from '../lib/pdf';
import { TextInput } from './ui';

const CLOUD_LABEL = {
  idle: 'Online',
  loading: 'Lade …',
  saving: 'Speichert …',
  synced: 'Online · synchron',
  error: 'Sync-Fehler',
} as const;

export function TopBar({ result }: { result: ProjectResult }) {
  const project = useStore((s) => s.project);
  const patchProject = useStore((s) => s.patchProject);
  const replaceProject = useStore((s) => s.replaceProject);
  const newProject = useStore((s) => s.newProject);

  const cloudId = useStore((s) => s.cloudId);
  const cloudStatus = useStore((s) => s.cloudStatus);
  const cloudError = useStore((s) => s.cloudError);
  const setBrowserOpen = useStore((s) => s.setBrowserOpen);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      let id = cloudId;
      if (!id) {
        if (!cloudConfigured) {
          alert('Online-Speicher ist nicht eingerichtet.\nSiehe README: Abschnitt „Online teilen“.');
          return;
        }
        if (!getPassword()) {
          setBrowserOpen(true);
          return;
        }
        setSharing(true);
        id =await createCloudProject(project);
        setCloudHash(id);
      }
      const link = `${window.location.origin}${window.location.pathname}#p=${id}`;
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      alert(`Online teilen fehlgeschlagen:\n${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSharing(false);
    }
  }

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

      {cloudId && (
        <span
          className={`badge ${cloudStatus === 'error' ? 'error' : ''}`}
          title={cloudError ?? 'Online-Projekt – Änderungen werden live mit allen Bearbeitern abgeglichen'}
        >
          {CLOUD_LABEL[cloudStatus]}
        </span>
      )}
      <button className="btn" title="Alle Online-Projekte anzeigen" onClick={() => setBrowserOpen(true)}>
        Projekte
      </button>
      <button
        className="btn"
        disabled={sharing}
        title={cloudId ? 'Link zum gemeinsamen Bearbeiten kopieren' : 'Projekt online speichern und Link zum Teilen erzeugen'}
        onClick={share}
      >
        {sharing ? '…' : copied ? 'Link kopiert' : cloudId ? 'Link kopieren' : 'Online teilen'}
      </button>
      {cloudId && (
        <button
          className="btn"
          title="Verbindung trennen – das Projekt bleibt als lokale Kopie erhalten"
          onClick={() => setCloudHash(null)}
        >
          Offline
        </button>
      )}
      <button
        className="btn"
        onClick={() => {
          if (!confirm('Neues Projekt anlegen? Nicht gespeicherte Änderungen gehen verloren.')) return;
          setCloudHash(null);
          newProject();
        }}
      >
        Neu
      </button>
      <button
        className="btn"
        onClick={() =>
          pickProjectFile(
            (p) => {
              setCloudHash(null);
              replaceProject(p);
            },
            (msg) => alert(`Datei konnte nicht geladen werden:\n${msg}`),
          )
        }
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
