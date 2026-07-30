import { Fragment } from 'react';
import { useStore } from '../store';
import { PHASES, type PhaseId } from '../types';
import { fmtWattPlain, outletName, qtyOf, type ProjectResult } from '../lib/calc';
import { NumInput } from './ui';

/** Abgang, Ph, Watt, A, Max W */
const FIXED_COLS = 5;
const COL_W = [130, 52, 78, 58, 72];
const FX_COL_W = 58;

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function tint(hex: string, alpha: number) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function textOn(hex: string) {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#141414' : '#ffffff';
}

export function MatrixView({ result }: { result: ProjectResult }) {
  const project = useStore((s) => s.project);
  const setQty = useStore((s) => s.setQty);
  const updateOutlet = useStore((s) => s.updateOutlet);
  const selectOutlet = useStore((s) => s.selectOutlet);

  const fixtures = project.fixtures;
  /** +1 für die Füllspalte rechts, die überschüssige Breite schluckt. */
  const totalCols = FIXED_COLS + fixtures.length + 1;

  if (project.distributors.length === 0) {
    return <div className="empty-state">Noch kein Verteiler angelegt.</div>;
  }

  return (
    <div className="matrix-wrap">
      <table className="matrix">
        <colgroup>
          {COL_W.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
          {fixtures.map((f) => (
            <col key={f.id} style={{ width: FX_COL_W }} />
          ))}
          <col />
        </colgroup>
        <thead>
          <tr>
            <th className="name">Abgang</th>
            <th>Ph</th>
            <th>Watt</th>
            <th>A</th>
            <th>Max W</th>
            {fixtures.map((f, i) => (
              <th
                key={f.id}
                className={`fx ${i === 0 ? 'sep' : ''}`}
                style={{ background: f.color, color: textOn(f.color) }}
                title={`${f.name} · ${f.watt} W`}
              >
                <span className="fx-name">{f.name}</span>
                <span className="fx-w">{f.watt} W</span>
              </th>
            ))}
            <th className="filler" />
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
                      {box.outlets.map((o, rowIndex) => {
                        const or = br.outlets.get(o.id)!;
                        const cls = or.status === 'over' ? 'val-over' : or.status === 'warn' ? 'val-warn' : '';
                        return (
                          <tr key={o.id} className={`outlet-row ${rowIndex % 2 ? 'alt' : ''}`}>
                            <td
                              className="name"
                              onDoubleClick={() => selectOutlet({ distId: dist.id, boxId: box.id, outletId: o.id })}
                              title="Doppelklick öffnet den Abgang"
                            >
                              {outletName(box, o)}
                            </td>
                            <td className="cell-select">
                              <select
                                className={`phase-sel phase-${o.phase}`}
                                value={o.phase}
                                onChange={(e) =>
                                  updateOutlet(dist.id, box.id, o.id, { phase: e.target.value as PhaseId })
                                }
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
                            <td className="cell-input">
                              <NumInput
                                value={o.maxWatt}
                                onChange={(v) => updateOutlet(dist.id, box.id, o.id, { maxWatt: v })}
                                min={0}
                                step={100}
                                blankZero
                                onFocus={(e) => e.currentTarget.select()}
                              />
                            </td>
                            {fixtures.map((f, i) => {
                              const q = qtyOf(o, f.id);
                              return (
                                <td
                                  className={`qty ${q > 0 ? 'has' : ''} ${i === 0 ? 'sep' : ''}`}
                                  key={f.id}
                                  style={{ background: tint(f.color, q > 0 ? 0.26 : 0.05) }}
                                >
                                  <NumInput
                                    value={q}
                                    onChange={(v) => setQty(dist.id, box.id, o.id, f.id, v)}
                                    min={0}
                                    blankZero
                                    title={`${f.name} · ${f.watt} W`}
                                    onFocus={(e) => e.currentTarget.select()}
                                  />
                                </td>
                              );
                            })}
                            <td className="filler" />
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
            {fixtures.map((f, i) => (
              <td className={`num ${i === 0 ? 'sep' : ''}`} key={f.id} style={{ background: tint(f.color, 0.14) }}>
                {result.fixtureTotals.get(f.id)?.qty || ''}
              </td>
            ))}
            <td className="filler" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
