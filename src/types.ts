export type PhaseId = 'L1' | 'L2' | 'L3';

export const PHASES: PhaseId[] = ['L1', 'L2', 'L3'];

/** Ein Verbrauchertyp (Lampe, Hazer, Motor, …) aus der Bibliothek. */
export interface FixtureType {
  id: string;
  name: string;
  /** Wirkleistung je Stück in Watt. */
  watt: number;
  /** Farbe für Tabelle, Karten und PDF. */
  color: string;
  /** Optionaler eigener cos φ; leer = Projektwert. */
  cosPhi?: number;
  note?: string;
}

/** "n × Verbrauchertyp" an einem Abgang. */
export interface OutletLoad {
  fixtureId: string;
  qty: number;
}

/** Ein Abgang (Phase) einer Plugbox, z. B. FS1_3. */
export interface Outlet {
  id: string;
  /** 1-basiert, bestimmt den Namen FS1_<index>. */
  index: number;
  /** Überschreibt den automatischen Namen FS1_<index>. */
  nameOverride?: string;
  /** Netzphase der Zuleitung (bei dreiphasigen Abgängen ohne Bedeutung). */
  phase: PhaseId;
  /** Steckertyp, Schlüssel aus CONNECTORS (z. B. "cee32-3p"); leer bei Plugbox-Abgängen. */
  connector?: string;
  /** Drehstrom-Abgang: Last verteilt sich gleichmäßig auf L1/L2/L3, Absicherung gilt je Phase. */
  threePhase?: boolean;
  /** Hier angeschlossener Unterverteiler; dessen Last zählt auf diesen Abgang. */
  child?: Distributor;
  /** Absicherung in Ampere (hart, z. B. 16 A). */
  breakerAmps: number;
  /** Selbst gesetzte Obergrenze in Watt (weich, z. B. 2000 W). */
  maxWatt: number;
  loads: OutletLoad[];
  note?: string;
  enabled: boolean;
}

export interface CableSpec {
  cableTypeId: string;
  lengthM: number;
}

/** Eine Plugbox / ein Lastkabel-Abgang mit n Abgängen. */
export interface PlugBox {
  id: string;
  /** z. B. "FS1" */
  name: string;
  outlets: Outlet[];
  /** Optionale Zuleitung für die Spannungsfallberechnung. */
  cable?: CableSpec;
  note?: string;
}

export interface Distributor {
  id: string;
  /** z. B. "Avo1" */
  name: string;
  /** z. B. "Avolites ART2000" */
  model: string;
  /** Budget in Watt über alle Phasen. 0 = keine Grenze. */
  maxWatt: number;
  /** Absicherung je Netzphase in Ampere. 0 = keine Grenze. */
  maxAmpsPerPhase: number;
  /** Direkte Ausgänge (CEE, Schuko, …) – zusätzlich oder statt Plugboxen. */
  outlets: Outlet[];
  plugboxes: PlugBox[];
  note?: string;
}

/** Vorlage für einen Verteilertyp (eingebaut oder selbst gespeichert). */
export interface DistTemplate {
  id: string;
  name: string;
  model: string;
  /** Absicherung je Phase (A). */
  maxAmpsPerPhase: number;
  /** Ausgänge in Reihenfolge, z. B. 2 × cee32-3p, 6 × cee16-3p, 3 × schuko. */
  outlets: { connector: string; count: number }[];
  plugboxes: number;
}

export interface CableType {
  id: string;
  /** z. B. "H07RN-F 5G6" */
  name: string;
  crossSectionMm2: number;
  cores: number;
  /** Zulässige Dauerstrombelastbarkeit, informativ. */
  maxAmps: number;
}

export interface Project {
  name: string;
  venue: string;
  date: string;
  /** Sternspannung L–N in Volt. */
  voltage: number;
  /** Leitfähigkeit in m/(Ω·mm²): Kupfer 56 (20 °C) bzw. 48 betriebswarm. */
  conductivity: number;
  /** Projektweiter Leistungsfaktor. */
  cosPhi: number;
  /** Anzahl Abgänge bei neuen Plugboxen. */
  outletsPerBox: number;
  /** Vorgabe für den weichen Max-Wert je Abgang. */
  defaultOutletMaxWatt: number;
  /** Vorgabe für die Absicherung je Abgang. */
  defaultBreakerAmps: number;
  /** Warngrenze Spannungsfall in %. */
  maxVoltageDropPct: number;
  fixtures: FixtureType[];
  cableTypes: CableType[];
  distributors: Distributor[];
  /** Selbst gespeicherte Verteiler-Vorlagen. */
  templates?: DistTemplate[];
}

export type LoadStatus = 'empty' | 'ok' | 'warn' | 'over';
