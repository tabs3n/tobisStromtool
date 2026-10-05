import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { Project } from '../types';
import { parseProjectFile } from './projectFile';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudConfigured = Boolean(url && key);

const client = cloudConfigured ? createClient(url!, key!, { auth: { persistSession: false } }) : null;

function need() {
  if (!client) throw new Error('Online-Speicher nicht konfiguriert (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY fehlen).');
  return client;
}

const clientId = Math.random().toString(36).slice(2);

/* ── Team-Passwort (nur im Browser gemerkt) ──────────────────────────── */

const PASS_KEY = 'stromtool-team-password';
export const PASSWORD_MISSING = 'Passwort fehlt';

export function getPassword(): string | null {
  try {
    return localStorage.getItem(PASS_KEY);
  } catch {
    return null;
  }
}

export function setPassword(pass: string | null) {
  try {
    if (pass) localStorage.setItem(PASS_KEY, pass);
    else localStorage.removeItem(PASS_KEY);
  } catch {
    /* Speicher gesperrt – Passwort gilt dann nur bis zum Neuladen nicht */
  }
}

function pass(): string {
  const p = getPassword();
  if (!p) throw new Error(PASSWORD_MISSING);
  return p;
}

export async function checkPassword(candidate: string): Promise<boolean> {
  const { data, error } = await need().rpc('check_password', { p_pass: candidate });
  if (error) throw new Error(error.message);
  return data === true;
}

/* ── Projekte ────────────────────────────────────────────────────────── */

export interface ProjectSummary {
  id: string;
  name: string | null;
  venue: string | null;
  date: string | null;
  updated_at: string;
}

export async function listCloudProjects(): Promise<ProjectSummary[]> {
  const { data, error } = await need().rpc('list_projects', { p_pass: pass() });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectSummary[];
}

export async function createCloudProject(project: Project): Promise<string> {
  const { data, error } = await need().rpc('create_project', { p_pass: pass(), p_data: project });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function loadCloudProject(id: string): Promise<Project> {
  const { data, error } = await need().rpc('get_project', { p_pass: pass(), p_id: id });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Projekt nicht gefunden.');
  return parseProjectFile(JSON.stringify(data));
}

export async function saveCloudProject(id: string, project: Project): Promise<void> {
  const { error } = await need().rpc('save_project', { p_pass: pass(), p_id: id, p_data: project });
  if (error) throw new Error(error.message);
}

export async function deleteCloudProject(id: string): Promise<void> {
  const { error } = await need().rpc('delete_project', { p_pass: pass(), p_id: id });
  if (error) throw new Error(error.message);
}

export interface CloudChannel {
  push: (project: Project) => void;
  close: () => void;
}

/** Live-Abgleich über einen Broadcast-Kanal pro Projekt. */
export function joinCloudChannel(id: string, onRemote: (p: Project) => void): CloudChannel {
  const channel: RealtimeChannel = need().channel(`project:${id}`, { config: { broadcast: { self: false } } });
  channel
    .on('broadcast', { event: 'project' }, ({ payload }) => {
      if (payload?.sender === clientId) return;
      try {
        onRemote(parseProjectFile(JSON.stringify(payload.project)));
      } catch {
        /* defekte Nachricht ignorieren */
      }
    })
    .subscribe();
  return {
    push: (project) => void channel.send({ type: 'broadcast', event: 'project', payload: { sender: clientId, project } }),
    close: () => void need().removeChannel(channel),
  };
}
