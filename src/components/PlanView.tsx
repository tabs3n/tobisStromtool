import { DIRECT, useStore } from '../store';
import type { Distributor, FixtureType, Outlet, PhaseId, PlugBox } from '../types';
import { PHASES } from '../types';
import {
  fmtA,
  fmtW,
  fmtWattPlain,
  outletBreakerWatt,
  outletName,
  statusColor,
  type BoxResult,
  type OutletResult,
  type ProjectResult,
} from '../lib/calc';
import {
  allTemplates,
  budgetFromAmps,
  CONNECTORS,
  connectorLabel,
  directOutletName,
  SUPPLY_PRESETS,
} from '../lib/defaults';
import { MenuButton, NumInput, TextInput } from './ui';

/** Auswahlliste der Verteiler-Vorlagen (eingebaut + eigene). */
function useTemplateItems(onPick: (templateId: string) => void) {
  const templates = useStore((s) => s.project.templates);
  return allTemplates({ templates }).map((tpl, i) => ({
    label: tpl.name,
    hint: tpl.outlets.length
      ? tpl.outlets.map((o) => `${o.count}× ${connectorLabel(o.connector)}`).join(' · ')
      : tpl.plugboxes
        ? `${tpl.plugboxes} Plugboxen`
        : undefined,
    separator: i > 0 && tpl.id.startsWith('tpl_') && !allTemplates({ templates })[i - 1].id.startsWith('tpl_'),
    onClick: () => onPick(tpl.id),
  }));
}

export function PlanView({ result }: { result: ProjectResult }) {
  const distributors = useStore((s) => s.project.distributors);
  const addDistributor = useStore((s) => s.addDistributor);
  const templateItems = useTemplateItems(addDistributor);

  return (
    <div>
      {distributors.map((d) => (
        <DistributorCard key={d.id} dist={d} result={result} />
      ))}
      {distributors.length === 0 && (
        <div className="empty-state">Noch kein Verteiler angelegt.</div>
      )}
      <MenuButton label="+ Verteiler ▾" className="btn primary" align="left" items={templateItems} />
    </div>
  );
}

function DistributorCard({
  dist,
  result,
  parentLabel,
}: {
  dist: Distributor;
  result: ProjectResult;
  /** Gesetzt bei Unterverteilern: Name des Abgangs, an dem er hängt. */
  parentLabel?: string;
}) {
  const res = result.distributors.get(dist.id)!;
  const isChild = parentLabel !== undefined;
  const addDirectOutlet = useStore((s) => s.addDirectOutlet);
  const saveTemplate = useStore((s) => s.saveTemplate);
  const update = useStore((s) => s.updateDistributor);
  const remove = useStore((s) => s.removeDistributor);
  const move = useStore((s) => s.moveDistributor);
  const addPlugBox = useStore((s) => s.addPlugBox);
  const fixtures = useStore((s) => s.project.fixtures);
  const voltage = useStore((s) => s.project.voltage);
  const cosPhi = useStore((s) => s.project.cosPhi);

  const project = { voltage, cosPhi };
  const budgetPct = Math.min(100, res.pctOfBudget);

  return (
    <div className={`dist ${isChild ? 'child' : ''}`}>
      <div className="dist-head">
        <div>
          {isChild && <div className="child-label">↳ an {parentLabel}</div>}
          <TextInput
            className="inline dist-name"
            value={dist.name}
            onChange={(name) => update(dist.id, { name })}
            placeholder="Avo1"
          />
          <div>
            <TextInput
              className="inline"
              value={dist.model}
              onChange={(model) => update(dist.id, { model })}
              placeholder="Modell / Typ"
              style={{ width: 190, fontSize: 12, color: 'var(--text-2)' }}
            />
          </div>
        </div>

        <div className="dist-stats">
          <label className="field">
            <span>Zuleitung</span>
            <select
              value={SUPPLY_PRESETS.find((p) => p.amps === dist.maxAmpsPerPhase)?.label ?? ''}
              onChange={(e) => {
                const preset = SUPPLY_PRESETS.find((p) => p.label === e.target.value);
                if (preset) {
                  update(dist.id, {
                    maxAmpsPerPhase: preset.amps,
                    maxWatt: budgetFromAmps(preset.amps, project),
                  });
                }
              }}
              style={{ width: 128 }}
            >
              <option value="">eigener Wert</option>
              {SUPPLY_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label} ·{' '}
                  {(budgetFromAmps(p.amps, project) / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} kW
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>A / Phase</span>
            <NumInput
              value={dist.maxAmpsPerPhase}
              onChange={(maxAmpsPerPhase) => update(dist.id, { maxAmpsPerPhase })}
              min={0}
              blankZero
              placeholder="ohne"
              style={{ width: 68 }}
            />
          </label>
          <label className="field">
            <span>Budget W</span>
            <NumInput
              value={dist.maxWatt}
              onChange={(maxWatt) => update(dist.id, { maxWatt })}
              min={0}
              step={1000}
              blankZero
              placeholder="ohne"
              style={{ width: 92 }}
            />
          </label>
          <div className="stat">
            <span className="k">Belegt</span>
            <span className={`v ${res.overBudget ? 'bad' : ''}`}>{fmtW(res.watt)}</span>
          </div>
          {dist.maxWatt > 0 && (
            <div className="stat">
              <span className="k">Frei</span>
              <span className={`v ${res.remainingWatt < 0 ? 'bad' : ''}`}>{fmtW(res.remainingWatt)}</span>
            </div>
          )}
          <div className="stat">
            <span className="k">Auslastung</span>
            <span className={`v ${res.overBudget ? 'bad' : budgetPct > 90 ? 'warn' : ''}`}>
              {dist.maxWatt > 0 ? `${Math.round(res.pctOfBudget)} %` : '–'}
            </span>
          </div>
          <div className="stat">
            <span className="k">Schieflast</span>
            <span className={`v ${res.imbalancePct > 25 ? 'warn' : ''}`}>
              {res.maxPhaseAmps > 0 ? `${Math.round(res.imbalancePct)} %` : '–'}
            </span>
          </div>

          <div className="phasebars">
            {PHASES.map((p) => {
              const a = res.amps[p];
              const pct = dist.maxAmpsPerPhase > 0 ? (a / dist.maxAmpsPerPhase) * 100 : 0;
              const color = pct > 100 ? 'var(--danger)' : pct > 85 ? 'var(--warn)' : 'var(--ok)';
              return (
                <div className="phasebar" key={p}>
                  <span style={{ color: 'var(--muted)' }}>{p}</span>
                  <div className="track">
                    <div className="fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
                  </div>
                  <span style={{ textAlign: 'right', color: pct > 100 ? 'var(--danger)' : 'var(--text-2)' }}>
                    {fmtA(a)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {!isChild && (
            <>
              <button className="btn icon" title="nach oben" onClick={() => move(dist.id, -1)}>
                ↑
              </button>
              <button className="btn icon" title="nach unten" onClick={() => move(dist.id, 1)}>
                ↓
              </button>
            </>
          )}
          <button
            className="btn icon"
            title="Als Vorlage speichern (Ausgänge und Absicherung)"
            onClick={() => {
              const name = prompt('Name der Vorlage:', dist.model || dist.name);
              if (name !== null) saveTemplate(dist.id, name);
            }}
          >
            ☆
          </button>
          <button
            className="btn icon danger"
            title={isChild ? 'Unterverteiler entfernen' : 'Verteiler löschen'}
            onClick={() =>
              confirm(`${isChild ? 'Unterverteiler' : 'Verteiler'} ${dist.name} löschen?`) && remove(dist.id)
            }
          >
            ✕
          </button>
        </div>
      </div>

      <div className="boxes">
        {dist.outlets.length > 0 && (
          <div className="box">
            <div className="box-head">
              <span className="box-name">Ausgänge</span>
              <span className="box-sum">{dist.outlets.length} Stk.</span>
            </div>
            {dist.outlets.map((o) => (
              <OutletRow
                key={o.id}
                dist={dist}
                boxId={DIRECT}
                name={directOutletName(dist, o)}
                outlet={o}
                or={res.direct.get(o.id)!}
                fixtures={fixtures}
              />
            ))}
          </div>
        )}
        {dist.plugboxes.map((box) => (
          <PlugBoxCard
            key={box.id}
            dist={dist}
            box={box}
            res={res.boxes.get(box.id)!}
            fixtures={fixtures}
          />
        ))}
        <div className="add-col">
          <MenuButton
            label="+ Ausgang ▾"
            align="left"
            title="CEE-, Schuko- oder anderen Ausgang hinzufügen"
            items={CONNECTORS.map((c) => ({ label: c.label, onClick: () => addDirectOutlet(dist.id, c.id) }))}
          />
          <button className="btn" onClick={() => addPlugBox(dist.id)}>
            + Plugbox
          </button>
        </div>
      </div>

      {dist.outlets.some((o) => o.child) && (
        <div className="children">
          {dist.outlets.map(
            (o) =>
              o.child && (
                <DistributorCard
                  key={o.child.id}
                  dist={o.child}
                  result={result}
                  parentLabel={`${directOutletName(dist, o)} (${connectorLabel(o.connector)})`}
                />
              ),
          )}
        </div>
      )}
    </div>
  );
}

function PlugBoxCard({
  dist,
  box,
  res,
  fixtures,
}: {
  dist: Distributor;
  box: PlugBox;
  res: BoxResult;
  fixtures: FixtureType[];
}) {
  const updateBox = useStore((s) => s.updatePlugBox);
  const removeBox = useStore((s) => s.removePlugBox);
  const duplicateBox = useStore((s) => s.duplicatePlugBox);
  const moveBox = useStore((s) => s.movePlugBox);
  const setCable = useStore((s) => s.setBoxCable);
  const setOutletCount = useStore((s) => s.setOutletCount);
  const cableTypes = useStore((s) => s.project.cableTypes);
  const maxDropPct = useStore((s) => s.project.maxVoltageDropPct);

  return (
    <div className="box">
      <div className="box-head">
        <TextInput
          className="inline box-name"
          value={box.name}
          onChange={(name) => updateBox(dist.id, box.id, { name })}
          placeholder="FS1"
        />
        <span className="box-sum">
          {fmtWattPlain(res.watt)} W · L1 {res.amps.L1.toFixed(1)} / L2 {res.amps.L2.toFixed(1)} / L3{' '}
          {res.amps.L3.toFixed(1)} A
        </span>
        <button className="btn icon" title="nach links" onClick={() => moveBox(dist.id, box.id, -1)}>
          ‹
        </button>
        <button className="btn icon" title="nach rechts" onClick={() => moveBox(dist.id, box.id, 1)}>
          ›
        </button>
        <button className="btn icon" title="duplizieren" onClick={() => duplicateBox(dist.id, box.id)}>
          ⧉
        </button>
        <button
          className="btn icon danger"
          title="Plugbox löschen"
          onClick={() => confirm(`Plugbox ${box.name} löschen?`) && removeBox(dist.id, box.id)}
        >
          ✕
        </button>
      </div>

      <div className="box-cable">
        <span>Abgänge</span>
        <NumInput
          value={box.outlets.length}
          onChange={(n) => {
            const target = Math.max(1, Math.min(48, Math.round(n)));
            const dropped = box.outlets.slice(target);
            if (dropped.some((o) => o.loads.length > 0)) {
              const names = dropped.filter((o) => o.loads.length > 0).map((o) => outletName(box, o));
              if (!confirm(`${names.join(', ')} ${names.length === 1 ? 'ist' : 'sind'} bestückt und ${names.length === 1 ? 'wird' : 'werden'} entfernt. Fortfahren?`)) return;
            }
            setOutletCount(dist.id, box.id, target);
          }}
          min={1}
          max={48}
          style={{ width: 48 }}
          title="Anzahl der Abgänge dieser Plugbox"
        />
        <span style={{ color: 'var(--line)' }}>|</span>
        <span>Zuleitung</span>
        <select
          value={box.cable?.cableTypeId ?? ''}
          onChange={(e) => setCable(dist.id, box.id, e.target.value || null, box.cable?.lengthM ?? 25)}
        >
          <option value="">– keine –</option>
          {cableTypes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {box.cable && (
          <>
            <NumInput
              value={box.cable.lengthM}
              onChange={(lengthM) => setCable(dist.id, box.id, box.cable!.cableTypeId, lengthM)}
              min={0}
              step={5}
            />
            <span>m</span>
          </>
        )}
        {res.drop && (
          <span
            className={`drop ${res.drop.ok && !res.drop.ampacityExceeded ? '' : 'bad'}`}
            title={`Spannungsfall ${res.drop.dropV.toFixed(1)} V bei ${res.drop.amps.toFixed(1)} A · Grenzwert ${maxDropPct} %${
              res.drop.ampacityExceeded ? ` · Kabel nur bis ${res.drop.cable.maxAmps} A` : ''
            }`}
          >
            ΔU {res.drop.dropPct.toFixed(2)} %
          </span>
        )}
      </div>

      {box.outlets.map((o) => (
        <OutletRow
          key={o.id}
          dist={dist}
          boxId={box.id}
          name={outletName(box, o)}
          outlet={o}
          or={res.outlets.get(o.id)!}
          fixtures={fixtures}
        />
      ))}
    </div>
  );
}

function OutletRow({
  dist,
  boxId,
  name,
  outlet,
  or,
  fixtures,
}: {
  dist: Distributor;
  boxId: string;
  name: string;
  outlet: Outlet;
  or: OutletResult;
  fixtures: FixtureType[];
}) {
  const selectOutlet = useStore((s) => s.selectOutlet);
  const updateOutlet = useStore((s) => s.updateOutlet);
  const attachChild = useStore((s) => s.attachChild);
  const voltage = useStore((s) => s.project.voltage);
  const cosPhi = useStore((s) => s.project.cosPhi);
  const templateItems = useTemplateItems((id) => attachChild(dist.id, outlet.id, id));

  const breakerWatt = outletBreakerWatt(outlet, { voltage, cosPhi });
  const fillPct = Math.min(100, or.pctOfBreaker);
  const limitPct = breakerWatt > 0 && outlet.maxWatt > 0 ? Math.min(100, (outlet.maxWatt / breakerWatt) * 100) : null;
  const fxById = new Map(fixtures.map((f) => [f.id, f]));
  const isDirect = boxId === DIRECT;

  const cyclePhase = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = PHASES[(PHASES.indexOf(outlet.phase) + 1) % 3] as PhaseId;
    updateOutlet(dist.id, boxId, outlet.id, { phase: next });
  };

  return (
    <div
      className={`outlet ${outlet.enabled ? '' : 'disabled'}`}
      onClick={() => selectOutlet({ distId: dist.id, boxId, outletId: outlet.id })}
      title={outlet.child ? 'Klicken zum Bearbeiten des Abgangs' : 'Klicken zum Bestücken'}
    >
      <span className="oname">
        {name}
        {isDirect && <small className="conn">{connectorLabel(outlet.connector)}</small>}
      </span>
      {outlet.threePhase ? (
        <span className="phase-badge phase-3" title="Drehstrom – Last verteilt sich auf L1/L2/L3">
          3~
        </span>
      ) : (
        <button className={`phase-badge phase-${outlet.phase}`} onClick={cyclePhase} title="Netzphase wechseln">
          {outlet.phase}
        </button>
      )}
      <div className="outlet-body">
        <div className="outlet-meter">
          <div className="meter">
            <div className="fill" style={{ width: `${fillPct}%`, background: statusColor(or.status) }} />
            {limitPct !== null && limitPct < 100 && (
              <div className="limit" style={{ left: `${limitPct}%` }} title={`Ziel-Max ${outlet.maxWatt} W`} />
            )}
          </div>
          <span className="outlet-vals">
            <b style={{ color: or.status === 'over' ? 'var(--danger)' : undefined }}>{fmtWattPlain(or.watt)} W</b>
            {' · '}
            {or.amps.toFixed(1)} A{outlet.threePhase ? '/Ph' : ''}
          </span>
        </div>
        <div className="chips">
          {outlet.child && (
            <span className="chip">
              <b>↳</b> {outlet.child.name}
              {outlet.child.model && ` · ${outlet.child.model}`}
            </span>
          )}
          {!outlet.child && outlet.loads.length === 0 && <span className="chip empty">frei</span>}
          {!outlet.child &&
            outlet.loads.map((l) => {
              const f = fxById.get(l.fixtureId);
              if (!f) return null;
              return (
                <span className="chip" key={l.fixtureId} title={`${f.watt} W/Stück`}>
                  <span className="dot" style={{ background: f.color }} />
                  <b>{l.qty}×</b> {f.name}
                </span>
              );
            })}
          {isDirect && !outlet.child && (
            <span onClick={(e) => e.stopPropagation()}>
              <MenuButton
                label="↳ Vt"
                className="btn sm"
                align="left"
                items={templateItems}
                title="Verteiler an diesen Ausgang anschließen"
              />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

