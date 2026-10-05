import type {
  CableType,
  Distributor,
  FixtureType,
  LoadStatus,
  Outlet,
  PhaseId,
  PlugBox,
  Project,
} from '../types';
import { PHASES } from '../types';
import { directOutletName } from './defaults';
import { flattenDistributors } from './tree';

export type PhaseTotals = Record<PhaseId, number>;

export const zeroPhases = (): PhaseTotals => ({ L1: 0, L2: 0, L3: 0 });

export function fixtureIndex(project: Project): Map<string, FixtureType> {
  return new Map(project.fixtures.map((f) => [f.id, f]));
}

export function outletName(box: PlugBox, outlet: Outlet): string {
  return outlet.nameOverride?.trim() || `${box.name}_${outlet.index}`;
}

/** Name eines Abgangs; `box` fehlt bei direkten Verteilerausgängen. */
export function nameOfOutlet(dist: Distributor, box: PlugBox | undefined, outlet: Outlet): string {
  return box ? outletName(box, outlet) : directOutletName(dist, outlet);
}

/** Leistung, die die Absicherung des Abgangs trägt (Drehstrom: alle drei Phasen). */
export function outletBreakerWatt(outlet: Outlet, project: Pick<Project, 'voltage' | 'cosPhi'>): number {
  return outlet.breakerAmps * project.voltage * project.cosPhi * (outlet.threePhase ? 3 : 1);
}

export function qtyOf(outlet: Outlet, fixtureId: string): number {
  return outlet.loads.find((l) => l.fixtureId === fixtureId)?.qty ?? 0;
}

/** Scheinstrom aus Wirkleistung: I = P / (U · cos φ). */
export function wattToAmps(watt: number, voltage: number, cosPhi: number): number {
  if (voltage <= 0 || cosPhi <= 0) return 0;
  return watt / (voltage * cosPhi);
}

export interface OutletResult {
  watt: number;
  /** Strom je Leiter: bei 1~ der Strom, bei 3~ ein Drittel – vergleichbar mit der Absicherung. */
  amps: number;
  /** Strom je Netzphase des übergeordneten Verteilers. */
  phaseAmps: PhaseTotals;
  phaseWatt: PhaseTotals;
  /** Auslastung bezogen auf den weichen Max-Wert. */
  pctOfMax: number;
  /** Auslastung bezogen auf die Absicherung. */
  pctOfBreaker: number;
  status: LoadStatus;
  fixtureCount: number;
}

export function calcOutlet(
  outlet: Outlet,
  fx: Map<string, FixtureType>,
  project: Project,
  child?: DistributorResult,
): OutletResult {
  const phaseAmps = zeroPhases();
  const phaseWatt = zeroPhases();
  let watt = 0;
  let amps = 0;
  let fixtureCount = 0;

  if (outlet.enabled && child) {
    // Unterverteiler: dessen Phasen laufen 1:1 durch (3~) bzw. summieren sich auf die eine Phase (1~).
    watt = child.watt;
    fixtureCount = child.fixtureCount;
    if (outlet.threePhase) {
      for (const p of PHASES) {
        phaseAmps[p] = child.amps[p];
        phaseWatt[p] = child.wattPerPhase[p];
      }
      amps = Math.max(...PHASES.map((p) => child.amps[p]));
    } else {
      amps = PHASES.reduce((a, p) => a + child.amps[p], 0);
      phaseAmps[outlet.phase] = amps;
      phaseWatt[outlet.phase] = watt;
    }
  } else if (outlet.enabled) {
    let totalAmps = 0;
    for (const load of outlet.loads) {
      const f = fx.get(load.fixtureId);
      if (!f || load.qty <= 0) continue;
      const p = f.watt * load.qty;
      watt += p;
      totalAmps += wattToAmps(p, project.voltage, f.cosPhi ?? project.cosPhi);
      fixtureCount += load.qty;
    }
    if (outlet.threePhase) {
      amps = totalAmps / 3;
      for (const p of PHASES) {
        phaseAmps[p] = amps;
        phaseWatt[p] = watt / 3;
      }
    } else {
      amps = totalAmps;
      phaseAmps[outlet.phase] = amps;
      phaseWatt[outlet.phase] = watt;
    }
  }
  const breakerWatt = outletBreakerWatt(outlet, project);
  const pctOfMax = outlet.maxWatt > 0 ? (watt / outlet.maxWatt) * 100 : 0;
  const pctOfBreaker = breakerWatt > 0 ? (watt / breakerWatt) * 100 : 0;

  let status: LoadStatus = 'ok';
  if (watt === 0) status = 'empty';
  else if (amps > outlet.breakerAmps + 1e-9) status = 'over';
  else if (outlet.maxWatt > 0 && watt > outlet.maxWatt + 1e-9) status = 'warn';

  return { watt, amps, phaseAmps, phaseWatt, pctOfMax, pctOfBreaker, status, fixtureCount };
}

export interface BoxResult {
  watt: number;
  amps: PhaseTotals;
  wattPerPhase: PhaseTotals;
  maxPhaseAmps: number;
  fixtureCount: number;
  outlets: Map<string, OutletResult>;
  /** Schieflast: (max − min) / max in %. */
  imbalancePct: number;
  drop: VoltageDropResult | null;
}

export function calcBox(box: PlugBox, fx: Map<string, FixtureType>, project: Project): BoxResult {
  const amps = zeroPhases();
  const wattPerPhase = zeroPhases();
  const outlets = new Map<string, OutletResult>();
  let watt = 0;
  let fixtureCount = 0;

  for (const outlet of box.outlets) {
    const r = calcOutlet(outlet, fx, project);
    outlets.set(outlet.id, r);
    watt += r.watt;
    fixtureCount += r.fixtureCount;
    for (const p of PHASES) {
      amps[p] += r.phaseAmps[p];
      wattPerPhase[p] += r.phaseWatt[p];
    }
  }

  const values = PHASES.map((p) => amps[p]);
  const maxPhaseAmps = Math.max(...values);
  const minPhaseAmps = Math.min(...values);
  const imbalancePct = maxPhaseAmps > 0 ? ((maxPhaseAmps - minPhaseAmps) / maxPhaseAmps) * 100 : 0;

  return {
    watt,
    amps,
    wattPerPhase,
    maxPhaseAmps,
    fixtureCount,
    outlets,
    imbalancePct,
    drop: calcVoltageDrop(box, project, maxPhaseAmps),
  };
}

export interface DistributorResult {
  watt: number;
  amps: PhaseTotals;
  wattPerPhase: PhaseTotals;
  maxPhaseAmps: number;
  imbalancePct: number;
  fixtureCount: number;
  /** Ergebnisse der direkten Ausgänge. */
  direct: Map<string, OutletResult>;
  boxes: Map<string, BoxResult>;
  /** Auslastung des Watt-Budgets in %. */
  pctOfBudget: number;
  /** Auslastung der höchstbelasteten Phase in %. */
  pctOfPhaseLimit: number;
  remainingWatt: number;
  overBudget: boolean;
  overPhase: boolean;
}

/**
 * Rechnet einen Verteiler samt Unterverteilern. Alle Ergebnisse (auch die der Unterverteiler)
 * landen in `all`.
 */
export function calcDistributor(
  dist: Distributor,
  fx: Map<string, FixtureType>,
  project: Project,
  all: Map<string, DistributorResult> = new Map(),
): DistributorResult {
  const amps = zeroPhases();
  const wattPerPhase = zeroPhases();
  const boxes = new Map<string, BoxResult>();
  const direct = new Map<string, OutletResult>();
  let watt = 0;
  let fixtureCount = 0;

  for (const outlet of dist.outlets) {
    const childRes = outlet.child ? calcDistributor(outlet.child, fx, project, all) : undefined;
    const r = calcOutlet(outlet, fx, project, childRes);
    direct.set(outlet.id, r);
    watt += r.watt;
    fixtureCount += r.fixtureCount;
    for (const p of PHASES) {
      amps[p] += r.phaseAmps[p];
      wattPerPhase[p] += r.phaseWatt[p];
    }
  }

  for (const box of dist.plugboxes) {
    const r = calcBox(box, fx, project);
    boxes.set(box.id, r);
    watt += r.watt;
    fixtureCount += r.fixtureCount;
    for (const p of PHASES) {
      amps[p] += r.amps[p];
      wattPerPhase[p] += r.wattPerPhase[p];
    }
  }

  const values = PHASES.map((p) => amps[p]);
  const maxPhaseAmps = Math.max(...values);
  const minPhaseAmps = Math.min(...values);

  const res: DistributorResult = {
    watt,
    amps,
    wattPerPhase,
    maxPhaseAmps,
    imbalancePct: maxPhaseAmps > 0 ? ((maxPhaseAmps - minPhaseAmps) / maxPhaseAmps) * 100 : 0,
    fixtureCount,
    direct,
    boxes,
    pctOfBudget: dist.maxWatt > 0 ? (watt / dist.maxWatt) * 100 : 0,
    pctOfPhaseLimit: dist.maxAmpsPerPhase > 0 ? (maxPhaseAmps / dist.maxAmpsPerPhase) * 100 : 0,
    remainingWatt: dist.maxWatt > 0 ? dist.maxWatt - watt : 0,
    overBudget: dist.maxWatt > 0 && watt > dist.maxWatt,
    overPhase: dist.maxAmpsPerPhase > 0 && maxPhaseAmps > dist.maxAmpsPerPhase,
  };
  all.set(dist.id, res);
  return res;
}

export interface VoltageDropResult {
  cable: CableType;
  lengthM: number;
  amps: number;
  dropV: number;
  dropPct: number;
  /** Spannung am Ende der Leitung (L–N). */
  voltageAtEnd: number;
  threePhase: boolean;
  ok: boolean;
  /** Strombelastbarkeit des Kabels überschritten? */
  ampacityExceeded: boolean;
}

/**
 * Spannungsfall der Zuleitung.
 * Drehstrom (≥ 4 Adern): ΔU = √3 · L · I · cos φ / (κ · A)  — bezogen auf U_LL = √3 · U
 * Wechselstrom (≤ 3 Adern): ΔU = 2 · L · I · cos φ / (κ · A) — bezogen auf U_LN
 * Gerechnet wird mit dem Strom der höchstbelasteten Phase (ungünstigster Fall).
 */
export function calcVoltageDrop(
  box: PlugBox,
  project: Project,
  ampsOnWorstPhase: number,
): VoltageDropResult | null {
  if (!box.cable || box.cable.lengthM <= 0) return null;
  const cable = project.cableTypes.find((c) => c.id === box.cable!.cableTypeId);
  if (!cable || cable.crossSectionMm2 <= 0) return null;

  const L = box.cable.lengthM;
  const I = ampsOnWorstPhase;
  const cosPhi = project.cosPhi;
  const kappa = project.conductivity;
  const threePhase = cable.cores >= 4;

  const factor = threePhase ? Math.sqrt(3) : 2;
  const dropV = (factor * L * I * cosPhi) / (kappa * cable.crossSectionMm2);
  const reference = threePhase ? project.voltage * Math.sqrt(3) : project.voltage;
  const dropPct = reference > 0 ? (dropV / reference) * 100 : 0;

  return {
    cable,
    lengthM: L,
    amps: I,
    dropV,
    dropPct,
    voltageAtEnd: project.voltage * (1 - dropPct / 100),
    threePhase,
    ok: dropPct <= project.maxVoltageDropPct,
    ampacityExceeded: cable.maxAmps > 0 && I > cable.maxAmps,
  };
}

export interface ProjectResult {
  watt: number;
  fixtureCount: number;
  distributors: Map<string, DistributorResult>;
  /** Stückzahlen je Verbrauchertyp über das ganze Projekt. */
  fixtureTotals: Map<string, { qty: number; watt: number }>;
  issues: Issue[];
}

export type IssueLevel = 'error' | 'warn';

export type IssueCode =
  | 'dist-budget'
  | 'dist-phase'
  | 'dist-imbalance'
  | 'cable-ampacity'
  | 'cable-drop'
  | 'outlet-breaker'
  /** Selbst gesetztes Ziel-Maximum überschritten – reine Planungshilfe, nicht im Report. */
  | 'outlet-target';

export interface Issue {
  level: IssueLevel;
  code: IssueCode;
  scope: string;
  message: string;
}

export function calcProject(project: Project): ProjectResult {
  const fx = fixtureIndex(project);
  const distributors = new Map<string, DistributorResult>();
  const fixtureTotals = new Map<string, { qty: number; watt: number }>();
  const issues: Issue[] = [];
  let watt = 0;
  let fixtureCount = 0;

  const addFixtureTotals = (outlet: Outlet) => {
    if (!outlet.enabled) return;
    for (const load of outlet.loads) {
      if (load.qty <= 0) continue;
      const f = fx.get(load.fixtureId);
      if (!f) continue;
      const prev = fixtureTotals.get(load.fixtureId) ?? { qty: 0, watt: 0 };
      prev.qty += load.qty;
      prev.watt += load.qty * f.watt;
      fixtureTotals.set(load.fixtureId, prev);
    }
  };

  // Hauptverteiler enthalten ihre Unterverteiler bereits in der Summe.
  for (const dist of project.distributors) {
    const dr = calcDistributor(dist, fx, project, distributors);
    watt += dr.watt;
    fixtureCount += dr.fixtureCount;
  }

  for (const { dist } of flattenDistributors(project)) {
    const dr = distributors.get(dist.id)!;

    if (dr.overBudget) {
      issues.push({
        level: 'error',
        code: 'dist-budget',
        scope: dist.name,
        message: `Leistungsbudget überschritten: ${fmtW(dr.watt)} von ${fmtW(dist.maxWatt)}.`,
      });
    }
    if (dr.overPhase) {
      issues.push({
        level: 'error',
        code: 'dist-phase',
        scope: dist.name,
        message: `Phasenabsicherung überschritten: ${dr.maxPhaseAmps.toFixed(1)} A von ${dist.maxAmpsPerPhase} A.`,
      });
    } else if (dr.imbalancePct > 25 && dr.maxPhaseAmps > 5) {
      issues.push({
        level: 'warn',
        code: 'dist-imbalance',
        scope: dist.name,
        message: `Schieflast ${dr.imbalancePct.toFixed(0)} % (L1 ${dr.amps.L1.toFixed(1)} A / L2 ${dr.amps.L2.toFixed(1)} A / L3 ${dr.amps.L3.toFixed(1)} A).`,
      });
    }

    for (const outlet of dist.outlets) {
      const or = dr.direct.get(outlet.id)!;
      const name = directOutletName(dist, outlet);
      if (or.status === 'over') {
        issues.push({
          level: 'error',
          code: 'outlet-breaker',
          scope: `${dist.name} · ${name}`,
          message: `${or.amps.toFixed(1)} A${outlet.threePhase ? ' je Phase' : ''} über Absicherung ${outlet.breakerAmps} A (${fmtW(or.watt)}).`,
        });
      } else if (or.status === 'warn') {
        issues.push({
          level: 'warn',
          code: 'outlet-target',
          scope: `${dist.name} · ${name}`,
          message: `${fmtW(or.watt)} über eigenem Maximum ${fmtW(outlet.maxWatt)}.`,
        });
      }
      addFixtureTotals(outlet);
    }

    for (const box of dist.plugboxes) {
      const br = dr.boxes.get(box.id)!;
      if (br.drop) {
        if (br.drop.ampacityExceeded) {
          issues.push({
            level: 'error',
            code: 'cable-ampacity',
            scope: `${dist.name} · ${box.name}`,
            message: `Zuleitung ${br.drop.cable.name}: ${br.drop.amps.toFixed(1)} A über Belastbarkeit ${br.drop.cable.maxAmps} A.`,
          });
        }
        if (!br.drop.ok) {
          issues.push({
            level: 'warn',
            code: 'cable-drop',
            scope: `${dist.name} · ${box.name}`,
            message: `Spannungsfall ${br.drop.dropPct.toFixed(2)} % über Grenzwert ${project.maxVoltageDropPct} % (${br.drop.cable.name}, ${br.drop.lengthM} m).`,
          });
        }
      }
      for (const outlet of box.outlets) {
        const or = br.outlets.get(outlet.id)!;
        const name = outletName(box, outlet);
        if (or.status === 'over') {
          issues.push({
            level: 'error',
            code: 'outlet-breaker',
            scope: `${dist.name} · ${name}`,
            message: `${or.amps.toFixed(1)} A über Absicherung ${outlet.breakerAmps} A (${fmtW(or.watt)}).`,
          });
        } else if (or.status === 'warn') {
          issues.push({
            level: 'warn',
            code: 'outlet-target',
            scope: `${dist.name} · ${name}`,
            message: `${fmtW(or.watt)} über eigenem Maximum ${fmtW(outlet.maxWatt)}.`,
          });
        }
        addFixtureTotals(outlet);
      }
    }
  }

  return { watt, fixtureCount, distributors, fixtureTotals, issues };
}

// ── Formatierung ───────────────────────────────────────────────────────────

export function fmtW(watt: number): string {
  if (Math.abs(watt) >= 10000) return `${(watt / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} kW`;
  if (Math.abs(watt) >= 1000) return `${(watt / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} kW`;
  return `${Math.round(watt).toLocaleString('de-DE')} W`;
}

export function fmtWattPlain(watt: number): string {
  return Math.round(watt).toLocaleString('de-DE');
}

export function fmtA(amps: number): string {
  return `${amps.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} A`;
}

export function statusColor(status: LoadStatus): string {
  switch (status) {
    case 'over':
      return 'var(--danger)';
    case 'warn':
      return 'var(--warn)';
    case 'ok':
      return 'var(--ok)';
    default:
      return 'var(--muted)';
  }
}
