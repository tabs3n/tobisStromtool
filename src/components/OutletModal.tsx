import { useMemo, useState } from 'react';
import { DIRECT, useStore } from '../store';
import { PHASES, type PhaseId } from '../types';
import {
  calcDistributor,
  calcOutlet,
  fixtureIndex,
  fmtWattPlain,
  nameOfOutlet,
  outletBreakerWatt,
  qtyOf,
  statusColor,
} from '../lib/calc';
import { allTemplates, CONNECTORS, connectorById, directOutletName } from '../lib/defaults';
import { findDistributor } from '../lib/tree';
import { MenuButton, Modal, NumInput, TextInput } from './ui';

export function OutletModal() {
  const sel = useStore((s) => s.selectedOutlet);
  const project = useStore((s) => s.project);
  const close = useStore((s) => s.selectOutlet);
  const setQty = useStore((s) => s.setQty);
  const bumpQty = useStore((s) => s.bumpQty);
  const updateOutlet = useStore((s) => s.updateOutlet);
  const clearOutlet = useStore((s) => s.clearOutlet);
  const attachChild = useStore((s) => s.attachChild);
  const removeDistributor = useStore((s) => s.removeDistributor);
  const removeOutlet = useStore((s) => s.removeOutlet);
  const [filter, setFilter] = useState('');

  const found = useMemo(() => {
    if (!sel) return null;
    const dist = findDistributor(project, sel.distId);
    const box = sel.boxId === DIRECT ? undefined : dist?.plugboxes.find((b) => b.id === sel.boxId);
    const pool = sel.boxId === DIRECT ? dist?.outlets : box?.outlets;
    const outlet = pool?.find((o) => o.id === sel.outletId);
    return dist && outlet ? { dist, box, outlet } : null;
  }, [sel, project]);

  if (!sel || !found) return null;
  const { dist, box, outlet } = found;

  const fx = fixtureIndex(project);
  const isDirect = !box;
  const res = calcOutlet(outlet, fx, project, outlet.child ? calcDistributor(outlet.child, fx, project) : undefined);
  const breakerWatt = outletBreakerWatt(outlet, project);
  const templateItems = allTemplates(project).map((tpl) => ({
    label: tpl.name,
    onClick: () => attachChild(dist.id, outlet.id, tpl.id),
  }));
  const label = nameOfOutlet(dist, box, outlet);
  const fillPct = breakerWatt > 0 ? Math.min(100, (res.watt / breakerWatt) * 100) : 0;
  const limitPct = breakerWatt > 0 && outlet.maxWatt > 0 ? Math.min(100, (outlet.maxWatt / breakerWatt) * 100) : null;

  const list = project.fixtures.filter((f) =>
    filter.trim() ? f.name.toLowerCase().includes(filter.trim().toLowerCase()) : true,
  );

  const boxId = box?.id ?? DIRECT;
  const patch = (p: Parameters<typeof updateOutlet>[3]) => updateOutlet(dist.id, boxId, outlet.id, p);

  return (
    <Modal
      title={
        <>
          {label}{' '}
          <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>
            · {dist.name}
            {box && ` / ${box.name}`}
          </span>
        </>
      }
      onClose={() => close(null)}
      footer={
        <>
          <button className="btn danger" onClick={() => clearOutlet(dist.id, boxId, outlet.id)}>
            Leeren
          </button>
          <button
            className="btn danger"
            disabled={!!box && box.outlets.length <= 1}
            title={box && box.outlets.length <= 1 ? 'Die letzte Plugbox-Phase lässt sich nicht entfernen' : undefined}
            onClick={() => {
              if (outlet.child && !confirm(`${label} versorgt ${outlet.child.name}. Abgang samt Unterverteiler entfernen?`)) return;
              if (!outlet.child && outlet.loads.length > 0 && !confirm(`${label} ist bestückt. Abgang trotzdem entfernen?`)) return;
              removeOutlet(dist.id, boxId, outlet.id);
            }}
          >
            Abgang entfernen
          </button>
          <div style={{ flex: 1 }} />
          <div className="meter" style={{ width: 200, height: 11 }}>
            <div className="fill" style={{ width: `${fillPct}%`, background: statusColor(res.status) }} />
            {limitPct !== null && limitPct < 100 && <div className="limit" style={{ left: `${limitPct}%` }} />}
          </div>
          <b
            style={{
              fontVariantNumeric: 'tabular-nums',
              color: res.status === 'over' ? 'var(--danger)' : res.status === 'warn' ? 'var(--warn)' : undefined,
            }}
          >
            {fmtWattPlain(res.watt)} W · {res.amps.toFixed(1)} A
          </b>
          <button className="btn primary" onClick={() => close(null)}>
            Fertig
          </button>
        </>
      }
    >
      <div className="row" style={{ marginBottom: 12, gap: 12 }}>
        <label className="field">
          <span>Name</span>
          <TextInput
            value={outlet.nameOverride ?? ''}
            onChange={(v) => patch({ nameOverride: v || undefined })}
            placeholder={box ? `${box.name}_${outlet.index}` : directOutletName(dist, outlet)}
            style={{ width: 130 }}
          />
        </label>
        {isDirect && (
          <label className="field">
            <span>Stecker</span>
            <select
              value={outlet.connector ?? ''}
              onChange={(e) => {
                const c = connectorById(e.target.value);
                if (c) patch({ connector: c.id, threePhase: c.threePhase, breakerAmps: c.amps });
              }}
            >
              {CONNECTORS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {outlet.threePhase ? (
          <label className="field">
            <span>Netzphase</span>
            <select disabled>
              <option>L1 · L2 · L3</option>
            </select>
          </label>
        ) : (
          <label className="field">
            <span>Netzphase</span>
            <select value={outlet.phase} onChange={(e) => patch({ phase: e.target.value as PhaseId })}>
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>{outlet.threePhase ? 'Sicherung A / Ph.' : 'Sicherung A'}</span>
          <NumInput value={outlet.breakerAmps} onChange={(v) => patch({ breakerAmps: v })} min={0} style={{ width: 70 }} />
        </label>
        <label className="field">
          <span>Max W (Ziel)</span>
          <NumInput
            value={outlet.maxWatt}
            onChange={(v) => patch({ maxWatt: v })}
            min={0}
            step={100}
            blankZero
            placeholder="ohne"
            style={{ width: 88 }}
          />
        </label>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'end' }}>
          <input type="checkbox" checked={outlet.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
          <span style={{ fontSize: 12, textTransform: 'none', color: 'var(--text-2)' }}>aktiv</span>
        </label>
        <label className="field" style={{ flex: 1, minWidth: 140 }}>
          <span>Notiz</span>
          <TextInput value={outlet.note ?? ''} onChange={(v) => patch({ note: v || undefined })} style={{ width: '100%' }} />
        </label>
      </div>

      {outlet.child ? (
        <div className="empty-state" style={{ textAlign: 'left' }}>
          Hier hängt der Unterverteiler <b>{outlet.child.name}</b>
          {outlet.child.model && ` (${outlet.child.model})`}. Seine Last zählt auf diesen Abgang; bestückt wird er
          im Plan.
          <div style={{ marginTop: 8 }}>
            <button
              className="btn danger"
              onClick={() => confirm(`Unterverteiler ${outlet.child!.name} entfernen?`) && removeDistributor(outlet.child!.id)}
            >
              Unterverteiler entfernen
            </button>
          </div>
        </div>
      ) : (
        <>
          {isDirect && (
            <div className="row" style={{ marginBottom: 8 }}>
              <MenuButton label="↳ Verteiler anschließen" align="left" items={templateItems} />
            </div>
          )}
      <div className="row" style={{ marginBottom: 6 }}>
        <TextInput value={filter} onChange={setFilter} placeholder="Verbraucher suchen…" style={{ flex: 1 }} />
      </div>

      <div className="picker">
        {list.map((f) => {
          const q = qtyOf(outlet, f.id);
          return (
            <div className={`picker-row ${q > 0 ? 'active' : ''}`} key={f.id}>
              <span className="sw" style={{ background: f.color }} />
              <span>{f.name}</span>
              <span className="w">{f.watt} W</span>
              <div className="stepper">
                <button className="btn icon" onClick={() => bumpQty(dist.id, boxId, outlet.id, f.id, -1)}>
                  −
                </button>
                <NumInput
                  value={q}
                  onChange={(v) => setQty(dist.id, boxId, outlet.id, f.id, v)}
                  min={0}
                  blankZero
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button className="btn icon" onClick={() => bumpQty(dist.id, boxId, outlet.id, f.id, 1)}>
                  +
                </button>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <div className="empty-state">Kein Verbraucher gefunden.</div>}
      </div>
        </>
      )}
    </Modal>
  );
}
