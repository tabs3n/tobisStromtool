import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { PHASES, type PhaseId } from '../types';
import { calcOutlet, fixtureIndex, fmtWattPlain, outletName, qtyOf, statusColor } from '../lib/calc';
import { Modal, NumInput, TextInput } from './ui';

export function OutletModal() {
  const sel = useStore((s) => s.selectedOutlet);
  const project = useStore((s) => s.project);
  const close = useStore((s) => s.selectOutlet);
  const setQty = useStore((s) => s.setQty);
  const bumpQty = useStore((s) => s.bumpQty);
  const updateOutlet = useStore((s) => s.updateOutlet);
  const clearOutlet = useStore((s) => s.clearOutlet);
  const [filter, setFilter] = useState('');

  const found = useMemo(() => {
    if (!sel) return null;
    const dist = project.distributors.find((d) => d.id === sel.distId);
    const box = dist?.plugboxes.find((b) => b.id === sel.boxId);
    const outlet = box?.outlets.find((o) => o.id === sel.outletId);
    return dist && box && outlet ? { dist, box, outlet } : null;
  }, [sel, project]);

  if (!sel || !found) return null;
  const { dist, box, outlet } = found;

  const fx = fixtureIndex(project);
  const res = calcOutlet(outlet, fx, project);
  const breakerWatt = outlet.breakerAmps * project.voltage * project.cosPhi;
  const fillPct = breakerWatt > 0 ? Math.min(100, (res.watt / breakerWatt) * 100) : 0;
  const limitPct = breakerWatt > 0 && outlet.maxWatt > 0 ? Math.min(100, (outlet.maxWatt / breakerWatt) * 100) : null;

  const list = project.fixtures.filter((f) =>
    filter.trim() ? f.name.toLowerCase().includes(filter.trim().toLowerCase()) : true,
  );

  const patch = (p: Parameters<typeof updateOutlet>[3]) => updateOutlet(dist.id, box.id, outlet.id, p);

  return (
    <Modal
      title={
        <>
          {outletName(box, outlet)}{' '}
          <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>
            · {dist.name} / {box.name}
          </span>
        </>
      }
      onClose={() => close(null)}
      footer={
        <>
          <button className="btn danger" onClick={() => clearOutlet(dist.id, box.id, outlet.id)}>
            Abgang leeren
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
            placeholder={`${box.name}_${outlet.index}`}
            style={{ width: 130 }}
          />
        </label>
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
        <label className="field">
          <span>Sicherung A</span>
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
                <button className="btn icon" onClick={() => bumpQty(dist.id, box.id, outlet.id, f.id, -1)}>
                  −
                </button>
                <NumInput
                  value={q}
                  onChange={(v) => setQty(dist.id, box.id, outlet.id, f.id, v)}
                  min={0}
                  blankZero
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button className="btn icon" onClick={() => bumpQty(dist.id, box.id, outlet.id, f.id, 1)}>
                  +
                </button>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <div className="empty-state">Kein Verbraucher gefunden.</div>}
      </div>
    </Modal>
  );
}
