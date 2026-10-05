import { Fragment } from 'react';
import { DIRECT, useStore } from '../store';
import { PHASES, type Outlet, type PhaseId } from '../types';
import { fmtWattPlain, outletName, qtyOf, type OutletResult, type ProjectResult } from '../lib/calc';
import { connectorLabel, directOutletName } from '../lib/defaults';
import { flattenDistributors } from '../lib/tree';
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
  const nodes = flattenDistributors(project);
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
          {nodes.map(({ dist, depth, parentOutlet }) => {
            const dr = result.distributors.get(dist.id)!;
            const outletRow = (boxId: string, name: string, o: Outlet, or: OutletResult, rowIndex: number) => {
              const cls = or.status === 'over' ? 'val-over' : or.status === 'warn' ? 'val-warn' : '';
              return (
                <tr key={o.id} className={`outlet-row ${rowIndex % 2 ? 'alt' : ''}`}>
                  <td
                    className="name"
                    onDoubleClick={() => selectOutlet({ distId: dist.id, boxId, outletId: o.id })}
                    title="Doppelklick öffnet den Abgang"
                  >
                    {name}
                    {boxId === DIRECT && <small className="conn">{connectorLabel(o.connector)}</small>}
                  </td>
                  <td className="cell-select">
                    {o.threePhase ? (
                      <span className="phase-sel phase-3">3~</span>
                    ) : (
                      <select
                        className={`phase-sel phase-${o.phase}`}
                        value={o.phase}
                        onChange={(e) => updateOutlet(dist.id, boxId, o.id, { phase: e.target.value as PhaseId })}
                      >
                        {PHASES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className={`num ${cls}`}>{or.watt ? fmtWattPlain(or.watt) : ''}</td>
                  <td className={`num ${cls}`}>{or.watt ? or.amps.toFixed(1) : ''}</td>
                  <td className="cell-input">
                    <NumInput
                      value={o.maxWatt}
                      onChange={(v) => updateOutlet(dist.id, boxId, o.id, { maxWatt: v })}
                      min={0}
                      step={100}
                      blankZero
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </td>
                  {o.child ? (
                    <td className="child-cell" colSpan={fixtures.length + 1}>
                      ↳ Unterverteiler {o.child.name}
                      {o.child.model && ` · ${o.child.model}`}
                    </td>
                  ) : (
                    <>
                      {fixtures.map((fx, i) => {
                        const q = qtyOf(o, fx.id);
                        return (
                          <td
                            className={`qty ${q > 0 ? 'has' : ''} ${i === 0 ? 'sep' : ''}`}
                            key={fx.id}
                            style={{ background: tint(fx.color, q > 0 ? 0.26 : 0.05) }}
                          >
                            <NumInput
                              value={q}
                              onChange={(v) => setQty(dist.id, boxId, o.id, fx.id, v)}
                              min={0}
                              blankZero
                              title={`${fx.name} · ${fx.watt} W`}
                              onFocus={(e) => e.currentTarget.select()}
                            />
                          </td>
                        );
                      })}
                      <td className="filler" />
                    </>
                  )}
                </tr>
              );
            };

            return (
              <Fragment key={dist.id}>
                <tr className="dist-row">
                  <td colSpan={totalCols} style={{ paddingLeft: 10 + depth * 18 }}>
                    {parentOutlet && '↳ '}
                    {dist.name}
                    {dist.model && ` — ${dist.model}`} · {fmtWattPlain(dr.watt)} W
                    {dist.maxWatt > 0 && ` von ${fmtWattPlain(dist.maxWatt)} W · frei ${fmtWattPlain(dr.remainingWatt)} W`}
                    {' · '}
                    {PHASES.map((p) => `${p} ${dr.amps[p].toFixed(1)} A`).join(' / ')}
                  </td>
                </tr>
                {dist.outlets.length > 0 && (
                  <Fragment>
                    <tr className="group">
                      <td>Ausgänge</td>
                      <td className="wide" colSpan={totalCols - 1}>
                        {dist.outlets.length} Stk.
                      </td>
                    </tr>
                    {dist.outlets.map((o, i) => outletRow(DIRECT, directOutletName(dist, o), o, dr.direct.get(o.id)!, i))}
                  </Fragment>
                )}
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
                      {box.outlets.map((o, i) => outletRow(box.id, outletName(box, o), o, br.outlets.get(o.id)!, i))}
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
