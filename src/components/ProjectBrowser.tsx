import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store';
import {
  PASSWORD_MISSING,
  checkPassword,
  cloudConfigured,
  createCloudProject,
  deleteCloudProject,
  getPassword,
  listCloudProjects,
  setPassword,
  type ProjectSummary,
} from '../lib/cloud';
import { setCloudHash } from '../lib/useCloudSync';
import { Modal } from './ui';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

function PasswordGate({ onDone }: { onDone: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (await checkPassword(value)) {
        setPassword(value);
        onDone();
      } else {
        setError('Falsches Passwort.');
      }
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="pb-gate"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p>Team-Passwort eingeben, um die Online-Projekte zu sehen. Es wird nur in diesem Browser gemerkt.</p>
      <input
        type="password"
        autoFocus
        placeholder="Team-Passwort"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button className="btn primary" disabled={busy || !value}>
        {busy ? '…' : 'Entsperren'}
      </button>
      {error && <div className="pb-error">{error}</div>}
    </form>
  );
}

export function ProjectBrowser() {
  const open = useStore((s) => s.browserOpen);
  const setOpen = useStore((s) => s.setBrowserOpen);
  const project = useStore((s) => s.project);
  const cloudId = useStore((s) => s.cloudId);
  const retryCloud = useStore((s) => s.retryCloud);

  const [unlocked, setUnlocked] = useState(() => Boolean(getPassword()));
  const [items, setItems] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setItems(await listCloudProjects());
    } catch (e) {
      if (msg(e) === 'Falsches Passwort' || msg(e) === PASSWORD_MISSING) {
        setPassword(null);
        setUnlocked(false);
      } else {
        setError(msg(e));
      }
    }
  }, []);

  useEffect(() => {
    if (open && unlocked) void refresh();
  }, [open, unlocked, refresh]);

  if (!open) return null;

  const close = () => setOpen(false);

  async function saveCurrent() {
    setBusy(true);
    try {
      const id = await createCloudProject(project);
      setCloudHash(id);
      close();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: ProjectSummary) {
    if (!confirm(`Projekt „${p.name || 'Ohne Namen'}“ online endgültig löschen?`)) return;
    try {
      await deleteCloudProject(p.id);
      if (p.id === cloudId) setCloudHash(null);
      await refresh();
    } catch (e) {
      setError(msg(e));
    }
  }

  return (
    <Modal
      title="Online-Projekte"
      onClose={close}
      footer={
        unlocked ? (
          <>
            <button className="btn primary" disabled={busy} onClick={saveCurrent}>
              Aktuelles Projekt online speichern
            </button>
            <button className="btn" onClick={() => void refresh()}>
              Aktualisieren
            </button>
            <span style={{ flex: 1 }} />
            <button
              className="btn"
              onClick={() => {
                setPassword(null);
                setUnlocked(false);
                setItems(null);
              }}
            >
              Sperren
            </button>
          </>
        ) : undefined
      }
    >
      {!cloudConfigured ? (
        <p>Online-Speicher ist nicht eingerichtet (siehe README, Abschnitt „Online teilen“).</p>
      ) : !unlocked ? (
        <PasswordGate
          onDone={() => {
            setUnlocked(true);
            retryCloud();
          }}
        />
      ) : (
        <>
          {error && <div className="pb-error">{error}</div>}
          {items === null && !error && <p className="pb-muted">Lade …</p>}
          {items?.length === 0 && <p className="pb-muted">Noch keine Online-Projekte.</p>}
          {items && items.length > 0 && (
            <table className="pb-table">
              <thead>
                <tr>
                  <th>Projekt</th>
                  <th>Location</th>
                  <th>Datum</th>
                  <th>Zuletzt geändert</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className={p.id === cloudId ? 'current' : undefined}>
                    <td>{p.name || <em>Ohne Namen</em>}</td>
                    <td>{p.venue}</td>
                    <td>{p.date}</td>
                    <td>{fmtDate(p.updated_at)}</td>
                    <td className="pb-actions">
                      <button
                        className="btn sm primary"
                        disabled={p.id === cloudId}
                        onClick={() => {
                          setCloudHash(p.id);
                          close();
                        }}
                      >
                        {p.id === cloudId ? 'Geöffnet' : 'Öffnen'}
                      </button>
                      <button className="btn sm danger" title="Online löschen" onClick={() => void remove(p)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Modal>
  );
}
