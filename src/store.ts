import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { CableType, Distributor, FixtureType, Outlet, PlugBox, Project } from './types';
import { createEmptyProject, makeDistributor, makeOutlet, makePlugBox, nextPlugBoxName } from './lib/defaults';
import { uid } from './lib/uid';

interface Locate {
  dist?: Distributor;
  box?: PlugBox;
  outlet?: Outlet;
}

function locate(project: Project, distId: string, boxId?: string, outletId?: string): Locate {
  const dist = project.distributors.find((d) => d.id === distId);
  const box = boxId ? dist?.plugboxes.find((b) => b.id === boxId) : undefined;
  const outlet = outletId ? box?.outlets.find((o) => o.id === outletId) : undefined;
  return { dist, box, outlet };
}

export interface StoreState {
  project: Project;
  selectedOutlet: { distId: string; boxId: string; outletId: string } | null;
  /** ID des online geteilten Projekts (aus dem URL-Hash), sonst null. */
  cloudId: string | null;
  cloudStatus: 'idle' | 'loading' | 'saving' | 'synced' | 'error';
  cloudError: string | null;
  /** Erhöht sich, um das Laden des Online-Projekts erneut anzustoßen (z. B. nach Passworteingabe). */
  cloudNonce: number;
  browserOpen: boolean;

  retryCloud: () => void;
  setBrowserOpen: (open: boolean) => void;
  setCloud: (id: string | null) => void;
  setCloudStatus: (status: StoreState['cloudStatus'], error?: string) => void;
  /** Projektstand von einem anderen Bearbeiter übernehmen (Auswahl bleibt erhalten). */
  applyRemoteProject: (p: Project) => void;

  replaceProject: (p: Project) => void;
  newProject: () => void;
  patchProject: (patch: Partial<Project>) => void;
  /** Setzt das Ziel-Maximum (W) bei allen bestehenden Abgängen. */
  setAllOutletMaxWatt: (maxWatt: number) => void;

  addDistributor: () => void;
  updateDistributor: (id: string, patch: Partial<Distributor>) => void;
  removeDistributor: (id: string) => void;
  moveDistributor: (id: string, dir: -1 | 1) => void;

  addPlugBox: (distId: string) => void;
  updatePlugBox: (distId: string, boxId: string, patch: Partial<PlugBox>) => void;
  removePlugBox: (distId: string, boxId: string) => void;
  duplicatePlugBox: (distId: string, boxId: string) => void;
  movePlugBox: (distId: string, boxId: string, dir: -1 | 1) => void;
  setBoxCable: (distId: string, boxId: string, cableTypeId: string | null, lengthM: number) => void;
  removeOutlet: (distId: string, boxId: string, outletId: string) => void;
  setOutletCount: (distId: string, boxId: string, count: number) => void;

  updateOutlet: (distId: string, boxId: string, outletId: string, patch: Partial<Outlet>) => void;
  setQty: (distId: string, boxId: string, outletId: string, fixtureId: string, qty: number) => void;
  bumpQty: (distId: string, boxId: string, outletId: string, fixtureId: string, delta: number) => void;
  clearOutlet: (distId: string, boxId: string, outletId: string) => void;

  addFixture: () => void;
  updateFixture: (id: string, patch: Partial<FixtureType>) => void;
  removeFixture: (id: string) => void;
  moveFixture: (id: string, dir: -1 | 1) => void;

  addCableType: () => void;
  updateCableType: (id: string, patch: Partial<CableType>) => void;
  removeCableType: (id: string) => void;

  selectOutlet: (sel: StoreState['selectedOutlet']) => void;
}

function moveInArray<T>(arr: T[], index: number, dir: -1 | 1) {
  const target = index + dir;
  if (index < 0 || target < 0 || target >= arr.length) return;
  const [item] = arr.splice(index, 1);
  arr.splice(target, 0, item);
}

export const useStore = create<StoreState>()(
  persist(
    immer((set) => ({
      project: createEmptyProject(),
      selectedOutlet: null,
      cloudId: null,
      cloudStatus: 'idle',
      cloudError: null,
      cloudNonce: 0,
      browserOpen: false,

      retryCloud: () =>
        set((s) => {
          s.cloudNonce += 1;
        }),

      setBrowserOpen: (open) =>
        set((s) => {
          s.browserOpen = open;
        }),

      setCloud: (id) =>
        set((s) => {
          if (s.cloudId === id) return;
          s.cloudId = id;
          s.cloudStatus = 'idle';
          s.cloudError = null;
        }),

      setCloudStatus: (status, error) =>
        set((s) => {
          s.cloudStatus = status;
          s.cloudError = error ?? null;
        }),

      applyRemoteProject: (p) =>
        set((s) => {
          s.project = p;
          const sel = s.selectedOutlet;
          if (sel && !locate(p, sel.distId, sel.boxId, sel.outletId).outlet) s.selectedOutlet = null;
        }),

      replaceProject: (p) =>
        set((s) => {
          s.project = p;
          s.selectedOutlet = null;
        }),

      newProject: () =>
        set((s) => {
          s.project = createEmptyProject();
          s.selectedOutlet = null;
        }),

      patchProject: (patch) =>
        set((s) => {
          Object.assign(s.project, patch);
        }),

      setAllOutletMaxWatt: (maxWatt) =>
        set((s) => {
          for (const d of s.project.distributors)
            for (const b of d.plugboxes) for (const o of b.outlets) o.maxWatt = maxWatt;
        }),

      addDistributor: () =>
        set((s) => {
          const n = s.project.distributors.length + 1;
          const dist = makeDistributor(`Avo${n}`);
          dist.plugboxes = [makePlugBox(nextPlugBoxName(s.project), s.project)];
          s.project.distributors.push(dist);
        }),

      updateDistributor: (id, patch) =>
        set((s) => {
          const d = s.project.distributors.find((x) => x.id === id);
          if (d) Object.assign(d, patch);
        }),

      removeDistributor: (id) =>
        set((s) => {
          s.project.distributors = s.project.distributors.filter((d) => d.id !== id);
          if (s.selectedOutlet?.distId === id) s.selectedOutlet = null;
        }),

      moveDistributor: (id, dir) =>
        set((s) => {
          moveInArray(
            s.project.distributors,
            s.project.distributors.findIndex((d) => d.id === id),
            dir,
          );
        }),

      addPlugBox: (distId) =>
        set((s) => {
          const { dist } = locate(s.project, distId);
          if (dist) dist.plugboxes.push(makePlugBox(nextPlugBoxName(s.project), s.project));
        }),

      updatePlugBox: (distId, boxId, patch) =>
        set((s) => {
          const { box } = locate(s.project, distId, boxId);
          if (box) Object.assign(box, patch);
        }),

      removePlugBox: (distId, boxId) =>
        set((s) => {
          const { dist } = locate(s.project, distId);
          if (dist) dist.plugboxes = dist.plugboxes.filter((b) => b.id !== boxId);
          if (s.selectedOutlet?.boxId === boxId) s.selectedOutlet = null;
        }),

      duplicatePlugBox: (distId, boxId) =>
        set((s) => {
          const { dist, box } = locate(s.project, distId, boxId);
          if (!dist || !box) return;
          const copy: PlugBox = {
            ...JSON.parse(JSON.stringify(box)),
            id: uid('box'),
            name: nextPlugBoxName(s.project),
          };
          copy.outlets = copy.outlets.map((o) => ({ ...o, id: uid('out') }));
          dist.plugboxes.splice(dist.plugboxes.indexOf(box) + 1, 0, copy);
        }),

      movePlugBox: (distId, boxId, dir) =>
        set((s) => {
          const { dist } = locate(s.project, distId);
          if (!dist) return;
          moveInArray(
            dist.plugboxes,
            dist.plugboxes.findIndex((b) => b.id === boxId),
            dir,
          );
        }),

      setBoxCable: (distId, boxId, cableTypeId, lengthM) =>
        set((s) => {
          const { box } = locate(s.project, distId, boxId);
          if (!box) return;
          if (!cableTypeId) box.cable = undefined;
          else box.cable = { cableTypeId, lengthM };
        }),

      removeOutlet: (distId, boxId, outletId) =>
        set((s) => {
          const { box } = locate(s.project, distId, boxId);
          if (!box || box.outlets.length <= 1) return;
          box.outlets = box.outlets.filter((o) => o.id !== outletId);
          // Nur neu durchnummerieren – eine bewusst gesetzte Netzphase bleibt stehen.
          box.outlets.forEach((o, i) => {
            o.index = i + 1;
          });
          if (s.selectedOutlet?.outletId === outletId) s.selectedOutlet = null;
        }),

      setOutletCount: (distId, boxId, count) =>
        set((s) => {
          const { box } = locate(s.project, distId, boxId);
          if (!box) return;
          const target = Math.max(1, Math.min(48, Math.round(count)));
          while (box.outlets.length > target) box.outlets.pop();
          while (box.outlets.length < target) box.outlets.push(makeOutlet(box.outlets.length + 1, s.project));
          box.outlets.forEach((o, i) => {
            o.index = i + 1;
          });
          if (s.selectedOutlet?.boxId === boxId && !box.outlets.some((o) => o.id === s.selectedOutlet?.outletId)) {
            s.selectedOutlet = null;
          }
        }),

      updateOutlet: (distId, boxId, outletId, patch) =>
        set((s) => {
          const { outlet } = locate(s.project, distId, boxId, outletId);
          if (outlet) Object.assign(outlet, patch);
        }),

      setQty: (distId, boxId, outletId, fixtureId, qty) =>
        set((s) => {
          const { outlet } = locate(s.project, distId, boxId, outletId);
          if (!outlet) return;
          const clean = Math.max(0, Math.round(qty || 0));
          const existing = outlet.loads.find((l) => l.fixtureId === fixtureId);
          if (clean === 0) {
            outlet.loads = outlet.loads.filter((l) => l.fixtureId !== fixtureId);
          } else if (existing) {
            existing.qty = clean;
          } else {
            outlet.loads.push({ fixtureId, qty: clean });
          }
        }),

      /** Relativ ändern – bleibt auch bei schnellen Klicks auf +/− korrekt. */
      bumpQty: (distId, boxId, outletId, fixtureId, delta) =>
        set((s) => {
          const { outlet } = locate(s.project, distId, boxId, outletId);
          if (!outlet) return;
          const existing = outlet.loads.find((l) => l.fixtureId === fixtureId);
          const next = Math.max(0, (existing?.qty ?? 0) + delta);
          if (next === 0) {
            outlet.loads = outlet.loads.filter((l) => l.fixtureId !== fixtureId);
          } else if (existing) {
            existing.qty = next;
          } else {
            outlet.loads.push({ fixtureId, qty: next });
          }
        }),

      clearOutlet: (distId, boxId, outletId) =>
        set((s) => {
          const { outlet } = locate(s.project, distId, boxId, outletId);
          if (outlet) outlet.loads = [];
        }),

      addFixture: () =>
        set((s) => {
          const palette = ['#ff2b2b', '#ffb300', '#d4e02a', '#8bd14a', '#12b04c', '#25c0ef', '#1f76d2', '#b02aa8'];
          s.project.fixtures.push({
            id: uid('fx'),
            name: 'Neuer Verbraucher',
            watt: 100,
            color: palette[s.project.fixtures.length % palette.length],
          });
        }),

      updateFixture: (id, patch) =>
        set((s) => {
          const f = s.project.fixtures.find((x) => x.id === id);
          if (f) Object.assign(f, patch);
        }),

      removeFixture: (id) =>
        set((s) => {
          s.project.fixtures = s.project.fixtures.filter((f) => f.id !== id);
          for (const d of s.project.distributors)
            for (const b of d.plugboxes)
              for (const o of b.outlets) o.loads = o.loads.filter((l) => l.fixtureId !== id);
        }),

      moveFixture: (id, dir) =>
        set((s) => {
          moveInArray(
            s.project.fixtures,
            s.project.fixtures.findIndex((f) => f.id === id),
            dir,
          );
        }),

      addCableType: () =>
        set((s) => {
          s.project.cableTypes.push({
            id: uid('cbl'),
            name: 'Neuer Kabeltyp',
            crossSectionMm2: 2.5,
            cores: 5,
            maxAmps: 20,
          });
        }),

      updateCableType: (id, patch) =>
        set((s) => {
          const c = s.project.cableTypes.find((x) => x.id === id);
          if (c) Object.assign(c, patch);
        }),

      removeCableType: (id) =>
        set((s) => {
          s.project.cableTypes = s.project.cableTypes.filter((c) => c.id !== id);
          for (const d of s.project.distributors)
            for (const b of d.plugboxes) if (b.cable?.cableTypeId === id) b.cable = undefined;
        }),

      selectOutlet: (sel) =>
        set((s) => {
          s.selectedOutlet = sel;
        }),
    })),
    { name: 'stromtool-project-v1', partialize: (s) => ({ project: s.project }) as never },
  ),
);
