import type { Distributor, Outlet, Project } from '../types';

/** Ein Verteiler samt Position im Baum (Hauptverteiler: depth 0). */
export interface DistNode {
  dist: Distributor;
  depth: number;
  parent?: Distributor;
  /** Abgang des Elternverteilers, an dem dieser Verteiler hängt. */
  parentOutlet?: Outlet;
}

/** Alle Verteiler depth-first: Verteiler, dann seine Unterverteiler. */
export function flattenDistributors(project: Pick<Project, 'distributors'>): DistNode[] {
  const out: DistNode[] = [];
  const walk = (dist: Distributor, depth: number, parent?: Distributor, parentOutlet?: Outlet) => {
    out.push({ dist, depth, parent, parentOutlet });
    for (const o of dist.outlets) if (o.child) walk(o.child, depth + 1, dist, o);
  };
  for (const d of project.distributors) walk(d, 0);
  return out;
}

export function findDistributor(project: Pick<Project, 'distributors'>, id: string): Distributor | undefined {
  return flattenDistributors(project).find((n) => n.dist.id === id)?.dist;
}

/** Alle Abgänge eines Verteilers (direkte + Plugbox-Abgänge), ohne Unterverteiler. */
export function ownOutlets(dist: Distributor): Outlet[] {
  return [...dist.outlets, ...dist.plugboxes.flatMap((b) => b.outlets)];
}

/** Alle Abgänge im ganzen Projekt, inkl. Unterverteiler. */
export function allOutlets(project: Pick<Project, 'distributors'>): Outlet[] {
  return flattenDistributors(project).flatMap((n) => ownOutlets(n.dist));
}
