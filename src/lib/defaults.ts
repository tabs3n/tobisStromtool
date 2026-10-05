import type { CableType, DistTemplate, Distributor, FixtureType, Outlet, PlugBox, Project } from '../types';
import { PHASES } from '../types';
import { uid } from './uid';
import { flattenDistributors } from './tree';

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
    outlets: [],
    plugboxes: [],
  };
}

/** Steckertypen für direkte Verteilerausgänge. */
export interface Connector {
  id: string;
  label: string;
  amps: number;
  threePhase: boolean;
}

export const CONNECTORS: Connector[] = [
  { id: 'schuko', label: 'Schuko 16 A', amps: 16, threePhase: false },
  { id: 'cee16-1p', label: 'CEE 16 A (1~)', amps: 16, threePhase: false },
  { id: 'cee32-1p', label: 'CEE 32 A (1~)', amps: 32, threePhase: false },
  { id: 'cee16-3p', label: 'CEE 16 A (3~)', amps: 16, threePhase: true },
  { id: 'cee32-3p', label: 'CEE 32 A (3~)', amps: 32, threePhase: true },
  { id: 'cee63-3p', label: 'CEE 63 A (3~)', amps: 63, threePhase: true },
  { id: 'cee125-3p', label: 'CEE 125 A (3~)', amps: 125, threePhase: true },
  { id: 'powerlock-3p', label: 'Powerlock 400 A (3~)', amps: 400, threePhase: true },
];

export const connectorById = (id?: string) => CONNECTORS.find((c) => c.id === id);

/** Kurzname für Listen, z. B. "CEE 32 A". */
export const connectorLabel = (id?: string) => connectorById(id)?.label ?? 'Abgang';

/** Neuer direkter Ausgang. 1-phasige Ausgänge rotieren durch L1/L2/L3. */
export function makeDirectOutlet(
  connectorId: string,
  index: number,
  singlePhaseCount: number,
): Outlet {
  const c = connectorById(connectorId) ?? CONNECTORS[0];
  return {
    id: uid('out'),
    index,
    phase: defaultPhaseForIndex(singlePhaseCount + 1),
    connector: c.id,
    threePhase: c.threePhase,
    breakerAmps: c.amps,
    maxWatt: 0,
    loads: [],
    enabled: true,
  };
}

/** Eingebaute Verteiler-Vorlagen. */
export const BUILTIN_TEMPLATES: DistTemplate[] = [
  {
    id: 'tpl_plugbox',
    name: 'Plugbox-Verteiler (Avolites)',
    model: 'Avolites ART2000',
    maxAmpsPerPhase: 125,
    outlets: [],
    plugboxes: 2,
  },
  {
    id: 'tpl_125',
    name: '125 A Verteiler',
    model: 'Verteiler 125 A',
    maxAmpsPerPhase: 125,
    outlets: [
      { connector: 'cee32-3p', count: 2 },
      { connector: 'cee16-3p', count: 6 },
      { connector: 'schuko', count: 3 },
    ],
    plugboxes: 0,
  },
  {
    id: 'tpl_63',
    name: '63 A Verteiler',
    model: 'Verteiler 63 A',
    maxAmpsPerPhase: 63,
    outlets: [
      { connector: 'cee32-3p', count: 1 },
      { connector: 'cee16-3p', count: 3 },
      { connector: 'schuko', count: 3 },
    ],
    plugboxes: 0,
  },
  {
    id: 'tpl_32',
    name: '32 A Verteiler',
    model: 'Verteiler 32 A',
    maxAmpsPerPhase: 32,
    outlets: [{ connector: 'schuko', count: 6 }],
    plugboxes: 0,
  },
  {
    id: 'tpl_16',
    name: '16 A Verteiler',
    model: 'Verteiler 16 A',
    maxAmpsPerPhase: 16,
    outlets: [{ connector: 'schuko', count: 3 }],
    plugboxes: 0,
  },
  {
    id: 'tpl_empty',
    name: 'Leerer Verteiler',
    model: '',
    maxAmpsPerPhase: 63,
    outlets: [],
    plugboxes: 0,
  },
];

export function allTemplates(project: Pick<Project, 'templates'>): DistTemplate[] {
  return [...BUILTIN_TEMPLATES, ...(project.templates ?? [])];
}

/**
 * Verteiler aus Vorlage. `supply` überschreibt die Absicherung (z. B. beim Anschluss an einen
 * Abgang: dessen Absicherung und Phasenzahl bestimmen Zuleitung und Budget).
 */
export function makeDistributorFromTemplate(
  tpl: DistTemplate,
  name: string,
  project: Project,
  supply?: { amps: number; threePhase: boolean },
): Distributor {
  const amps = supply?.amps ?? tpl.maxAmpsPerPhase;
  const phases = supply ? (supply.threePhase ? 3 : 1) : 3;
  const dist = makeDistributor(name);
  dist.model = tpl.model;
  dist.maxAmpsPerPhase = amps;
  dist.maxWatt = Math.round((phases * project.voltage * amps * project.cosPhi) / 100) * 100;

  let n = 0;
  let singles = 0;
  for (const spec of tpl.outlets) {
    for (let i = 0; i < spec.count; i++) {
      const o = makeDirectOutlet(spec.connector, ++n, singles);
      if (!o.threePhase) singles++;
      dist.outlets.push(o);
    }
  }
  for (let i = 0; i < tpl.plugboxes; i++) dist.plugboxes.push(makePlugBox(nextPlugBoxName(project, dist.plugboxes), project));
  return dist;
}

/** Name für einen Direktausgang, z. B. "Avo1.3". */
export function directOutletName(dist: Pick<Distributor, 'name'>, o: Pick<Outlet, 'index' | 'nameOverride'>): string {
  return o.nameOverride?.trim() || `${dist.name}.${o.index}`;
}

/**
 * Zuleitungen zur Auswahl. Das Watt-Budget wird daraus mit den aktuellen
 * Projektwerten gerechnet, statt es fest zu hinterlegen.
 */
export const SUPPLY_PRESETS: { label: string; amps: number }[] = [
  { label: 'CEE 16 A', amps: 16 },
  { label: 'CEE 32 A', amps: 32 },
  { label: 'CEE 63 A', amps: 63 },
  { label: 'CEE 125 A', amps: 125 },
  { label: 'Powerlock 200 A', amps: 200 },
  { label: 'Powerlock 400 A', amps: 400 },
];

/** Budget aus Absicherung: P = 3 · U · I · cos φ, auf 100 W gerundet. */
export function budgetFromAmps(amps: number, p: Pick<Project, 'voltage' | 'cosPhi'>): number {
  return Math.round((3 * p.voltage * amps * p.cosPhi) / 100) * 100;
}

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
export function nextPlugBoxName(project: Pick<Project, 'distributors'>, extra: PlugBox[] = []): string {
  const used = new Set(
    [...flattenDistributors(project).flatMap((n) => n.dist.plugboxes), ...extra].map((b) => b.name.toUpperCase()),
  );
  for (let i = 1; i < 999; i++) {
    const candidate = `FS${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `FS${used.size + 1}`;
}
