import type { CableType, Distributor, FixtureType, Outlet, PlugBox, Project } from '../types';
import { PHASES } from '../types';
import { uid } from './uid';

/** 1&4 → L1, 2&5 → L2, 3&6 → L3 */
export function defaultPhaseForIndex(index: number) {
  return PHASES[(index - 1) % 3];
}

export function makeOutlet(index: number, p: Pick<Project, 'defaultOutletMaxWatt' | 'defaultBreakerAmps'>): Outlet {
  return {
    id: uid('out'),
    index,
    phase: defaultPhaseForIndex(index),
    breakerAmps: p.defaultBreakerAmps,
    maxWatt: p.defaultOutletMaxWatt,
    loads: [],
    enabled: true,
  };
}

export function makePlugBox(
  name: string,
  p: Pick<Project, 'outletsPerBox' | 'defaultOutletMaxWatt' | 'defaultBreakerAmps'>,
): PlugBox {
  return {
    id: uid('box'),
    name,
    outlets: Array.from({ length: p.outletsPerBox }, (_, i) => makeOutlet(i + 1, p)),
  };
}

export function makeDistributor(name: string): Distributor {
  return {
    id: uid('dist'),
    name,
    model: 'Avolites ART2000',
    maxWatt: 80000,
    maxAmpsPerPhase: 125,
    plugboxes: [],
  };
}

/** Verteiler-Vorlagen; alle Werte bleiben frei editierbar. */
export const DISTRIBUTOR_PRESETS: { model: string; maxAmpsPerPhase: number; maxWatt: number }[] = [
  { model: 'Avolites ART2000', maxAmpsPerPhase: 125, maxWatt: 80000 },
  { model: 'Avolites ART2000 (63 A Speisung)', maxAmpsPerPhase: 63, maxWatt: 43470 },
  { model: 'Baustromverteiler 63 A', maxAmpsPerPhase: 63, maxWatt: 43470 },
  { model: 'Baustromverteiler 32 A', maxAmpsPerPhase: 32, maxWatt: 22080 },
  { model: 'Powerlock 200 A', maxAmpsPerPhase: 200, maxWatt: 138000 },
];

export const DEFAULT_CABLE_TYPES: CableType[] = [
  { id: 'cbl_25', name: 'H07RN-F 5G2,5', crossSectionMm2: 2.5, cores: 5, maxAmps: 20 },
  { id: 'cbl_4', name: 'H07RN-F 5G4', crossSectionMm2: 4, cores: 5, maxAmps: 27 },
  { id: 'cbl_6', name: 'H07RN-F 5G6', crossSectionMm2: 6, cores: 5, maxAmps: 35 },
  { id: 'cbl_10', name: 'H07RN-F 5G10', crossSectionMm2: 10, cores: 5, maxAmps: 48 },
  { id: 'cbl_16', name: 'H07RN-F 5G16', crossSectionMm2: 16, cores: 5, maxAmps: 63 },
  { id: 'cbl_25q', name: 'H07RN-F 5G25', crossSectionMm2: 25, cores: 5, maxAmps: 83 },
  { id: 'cbl_35', name: 'H07RN-F 5G35', crossSectionMm2: 35, cores: 5, maxAmps: 103 },
  { id: 'cbl_50', name: 'Powerlock 1×50', crossSectionMm2: 50, cores: 1, maxAmps: 130 },
  { id: 'cbl_95', name: 'Powerlock 1×95', crossSectionMm2: 95, cores: 1, maxAmps: 195 },
];

/** Bibliothek aus der bisherigen Excel-Tabelle. */
export const DEFAULT_FIXTURES: FixtureType[] = [
  { id: 'fx_glpx5', name: 'GLP X5', watt: 710, color: '#ff2b2b' },
  { id: 'fx_sgmp6', name: 'SGM P6', watt: 630, color: '#ffb300' },
  { id: 'fx_esprite', name: 'Robe Esprite', watt: 900, color: '#d4e02a' },
  { id: 'fx_roxxf8', name: 'Roxx F8', watt: 800, color: '#8bd14a' },
  { id: 'fx_ax2', name: 'Astera AX2', watt: 105, color: '#12b04c' },
  { id: 'fx_hyperion', name: 'Astera Hyperion', watt: 145, color: '#25c0ef' },
  { id: 'fx_s4led', name: 'ETC S4 LED', watt: 240, color: '#1f76d2' },
  { id: 'fx_eshow', name: 'Roxx Eshow TW+', watt: 220, color: '#f08a8a' },
  { id: 'fx_ax9', name: 'Astera AX9', watt: 105, color: '#dc94e0' },
  { id: 'fx_forte', name: 'Robe Forte', watt: 1250, color: '#b02aa8' },
];

export function createEmptyProject(): Project {
  const project: Project = {
    name: 'Neues Projekt',
    venue: '',
    date: '',
    voltage: 230,
    conductivity: 56,
    cosPhi: 0.95,
    outletsPerBox: 6,
    defaultOutletMaxWatt: 2000,
    defaultBreakerAmps: 16,
    maxVoltageDropPct: 3,
    fixtures: DEFAULT_FIXTURES.map((f) => ({ ...f })),
    cableTypes: DEFAULT_CABLE_TYPES.map((c) => ({ ...c })),
    distributors: [],
  };

  const dist = makeDistributor('Avo1');
  dist.plugboxes = [makePlugBox('FS1', project), makePlugBox('FS2', project)];
  project.distributors = [dist];
  return project;
}

/** Nächster freier Plugbox-Name (FS1, FS2, …) über alle Verteiler hinweg. */
export function nextPlugBoxName(project: Project): string {
  const used = new Set(
    project.distributors.flatMap((d) => d.plugboxes.map((b) => b.name.toUpperCase())),
  );
  for (let i = 1; i < 999; i++) {
    const candidate = `FS${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `FS${used.size + 1}`;
}
