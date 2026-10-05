import { useEffect } from 'react';
import { useStore } from '../store';
import { PASSWORD_MISSING, joinCloudChannel, loadCloudProject, saveCloudProject } from './cloud';

/** Projekt-ID aus dem URL-Hash (#p=<uuid>). */
export function readCloudId(): string | null {
  const m = /[#&]p=([0-9a-fA-F-]{36})/.exec(window.location.hash);
  return m ? m[1] : null;
}

export function setCloudHash(id: string | null) {
  history.replaceState(null, '', id ? `#p=${id}` : window.location.pathname + window.location.search);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Hält das lokale Projekt und die Online-Kopie (falls ein #p=-Link aktiv ist) synchron. */
export function useCloudSync() {
  const cloudId = useStore((s) => s.cloudId);
  const cloudNonce = useStore((s) => s.cloudNonce);
  const setCloud = useStore((s) => s.setCloud);

  useEffect(() => {
    const sync = () => setCloud(readCloudId());
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [setCloud]);

  useEffect(() => {
    if (!cloudId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof joinCloudChannel> | undefined;
    // Zuletzt abgeglichene Projektreferenz – verhindert Rückkopplung bei Remote-Updates.
    let synced = useStore.getState().project;
    const status = (s: Parameters<ReturnType<typeof useStore.getState>['setCloudStatus']>[0], e?: string) =>
      alive && useStore.getState().setCloudStatus(s, e);
    const fail = (e: unknown) => {
      const m = msg(e);
      status('error', m);
      // Passwort fehlt oder ist falsch → Projekt-Browser mit Passwortabfrage öffnen.
      if (m === PASSWORD_MISSING || m === 'Falsches Passwort') useStore.getState().setBrowserOpen(true);
    };

    status('loading');
    loadCloudProject(cloudId)
      .then((p) => {
        if (!alive) return;
        synced = p;
        useStore.getState().applyRemoteProject(p);
        channel = joinCloudChannel(cloudId, (remote) => {
          synced = remote;
          useStore.getState().applyRemoteProject(remote);
          status('synced');
        });
        status('synced');
      })
      .catch(fail);

    const unsub = useStore.subscribe((state, prev) => {
      if (!channel || state.project === prev.project || state.project === synced) return;
      status('saving');
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const project = useStore.getState().project;
        synced = project;
        channel?.push(project);
        try {
          await saveCloudProject(cloudId, project);
          status('synced');
        } catch (e) {
          fail(e);
        }
      }, 350);
    });

    return () => {
      alive = false;
      clearTimeout(timer);
      unsub();
      channel?.close();
    };
  }, [cloudId, cloudNonce]);
}
