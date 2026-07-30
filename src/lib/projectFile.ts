import type { Project } from '../types';
import { createEmptyProject } from './defaults';

export const FILE_FORMAT = 'stromtool.project';
export const FILE_VERSION = 1;

interface FileEnvelope {
  format: string;
  version: number;
  savedAt: string;
  project: Project;
}

export function download(filename: string, data: BlobPart, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFilename(name: string): string {
  return (name || 'projekt').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'projekt';
}

export function saveProjectFile(project: Project) {
  const envelope: FileEnvelope = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    savedAt: new Date().toISOString(),
    project,
  };
  download(`${safeFilename(project.name)}.stromtool.json`, JSON.stringify(envelope, null, 2), 'application/json');
}

/** Liest eine Projektdatei und füllt fehlende Felder mit Standardwerten auf. */
export function parseProjectFile(text: string): Project {
  const raw = JSON.parse(text) as Partial<FileEnvelope> & Partial<Project>;
  const candidate = (raw as FileEnvelope).project ?? (raw as Project);
  if (!candidate || !Array.isArray(candidate.distributors)) {
    throw new Error('Keine gültige Stromtool-Projektdatei.');
  }
  const base = createEmptyProject();
  return {
    ...base,
    ...candidate,
    fixtures: candidate.fixtures ?? base.fixtures,
    cableTypes: candidate.cableTypes ?? base.cableTypes,
    distributors: candidate.distributors.map((d) => ({
      ...d,
      plugboxes: (d.plugboxes ?? []).map((b) => ({
        ...b,
        outlets: (b.outlets ?? []).map((o) => ({ ...o, loads: o.loads ?? [] })),
      })),
    })),
  };
}

export function pickProjectFile(onLoad: (p: Project) => void, onError: (msg: string) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      onLoad(parseProjectFile(await file.text()));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  input.click();
}
