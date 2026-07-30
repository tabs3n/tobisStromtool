import { Fragment } from 'react';
import { useStore } from '../store';
import { PHASES, type PhaseId } from '../types';
import { fmtWattPlain, outletName, qtyOf, type ProjectResult } from '../lib/calc';
import { NumInput } from './ui';

const FIXED_COLS = 5;

function textOn(hex: string) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#141414' : '#ffffff';
}

export function MatrixView({ result }: { result: ProjectResult }) {
  const project = useStore((s) => s.project);
  const setQty = useStore((s) => s.setQty);
  const updateOutlet = useStore((s) => s.updateOutlet);
  const selectOutlet = useStore((s) => s.selectOutlet);

  const fixtures = project.fixtures;
  const totalCols = FIXED_COLS + fixtures.length;

  if (project.distributors.length === 0) {
    return <div className="empty-state">Noch kein Verteiler angelegt.</div>;
  }

  return (
    <div className="matrix-wrap">
      <table className="matrix">
        <thead>
          <tr>
            <th className="name" rowSpan={2}>
              Abgang
            </th>
            <th rowSpan={2}>Ph</th>
            <th rowSpan={2}>Watt</th>
            <th rowSpan={2}>A</th>
            <th rowSpan={2}>Max W</th>
            {fixtures.map((f) => (
              <th key={f.id} className="fx" style={{ background: f.color, color: textOn(f.color) }} title={f.name}>
                {f.name}
              </th>
            ))}
          </tr>
          <tr>
            {fixtures.map((f) => (
              <th key={f.id} className="sub">
                {f.watt} W
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {project.distributors.map((dist) => {
            const dr = result.distributors.get(dist.id)!;
            return (
              <Fragment key={dist.id}>
                <tr className="dist-row">
                  <td colSpan={totalCols}>
                    {dist.name} — {dist.model} · {fmtWattPlain(dr.watt)} W
                    {dist.maxWatt > 0 && ` von ${fmtWattPlain(dist.maxWatt)} W · frei ${fmtWattPlain(dr.remainingWatt)} W`}
                    {' · '}
                    {PHASES.map((p) => `${p} ${dr.amps[p].toFixed(1)} A`).join(' / ')}
                  </td>
                </tr>
                {dist.plugboxes.map((box) => {
                  const br = dr.boxes.get(box.id)!;
                  return (
                    <Fragment key={box.id}>
                      <tr className="group">
                        <td>{box.name}</td>
                        <td className="wide" colSpan={totalCols - 1}>
                          {fmtWattPlain(br.watt)} W · L1 {br.amps.L1.toFixed(1)} / L2 {br.amps.L2.toFixed(1)} / L3{' '}
                          {br.amps.L3.toFixed(1)} A
                          {br.drop &&
                            ` · ${br.drop.cable.name}, ${br.drop.lengthM} m → ΔU ${br.drop.dropPct.toFixed(2)} %`}
                        </td>
                      </tr>
                      {box.outlets.map((o) => {
                        const or = br.outlets.get(o.id)!;
                        const cls = or.status === 'over' ? 'val-over' : or.status === 'warn' ? 'val-warn' : '';
                        return (
                          <tr key={o.id}>
                            <td
                              className="name"
                              onDoubleClick={() =>
                                selectOutlet({ distId: dist.id, boxId: box.id, outletId: o.id })
                              }
                              title="Doppelklick öffnet den Abgang"
                              style={{ cursor: 'pointer' }}
                            >
                              {outletName(box, o)}
                            </td>
                            <td style={{ textAlign: 'center', padding: 0 }}>
                              <select
                                value={o.phase}
                                onChange={(e) =>
                                  updateOutlet(dist.id, box.id, o.id, { phase: e.target.value as PhaseId })
                                }
                                style={{
                                  border: 0,
                                  background: 'transparent',
                                  padding: '3px 2px',
                                  fontSize: 11,
                                  width: 46,
                                }}
                              >
                                {PHASES.map((p) => (
                                  <option key={p} value={p}>
                                    {p}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className={`num ${cls}`}>{or.watt ? fmtWattPlain(or.watt) : ''}</td>
                            <td className={`num ${cls}`}>{or.watt ? or.amps.toFixed(1) : ''}</td>
                            <td className="num" style={{ padding: 0, width: 62 }}>
                              <NumInput
                                value={o.maxWatt}
                                onChange={(v) => updateOutlet(dist.id, box.id, o.id, { maxWatt: v })}
                                min={0}
                                step={100}
                                blankZero
                                style={{
                                  width: '100%',
                                  border: 0,
                                  background: 'transparent',
                                  textAlign: 'right',
                                  padding: '4px 6px',
                                }}
                              />
                            </td>
                            {fixtures.map((f) => {
                              const q = qtyOf(o, f.id);
                              return (
                                <td className={`qty ${q > 0 ? 'has' : ''}`} key={f.id}>
                                  <NumInput
                                    value={q}
                                    onChange={(v) => setQty(dist.id, box.id, o.id, f.id, v)}
                                    min={0}
                                    blankZero
                                    onFocus={(e) => e.currentTarget.select()}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
          <tr className="totals">
            <td>Gesamt</td>
            <td />
            <td className="num">{fmtWattPlain(result.watt)}</td>
            <td />
            <td />
            {fixtures.map((f) => (
              <td className="num" key={f.id}>
                {result.fixtureTotals.get(f.id)?.qty || ''}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
