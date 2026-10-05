import { useStore } from '../store';
import { flattenDistributors } from '../lib/tree';
import { fmtWattPlain, type ProjectResult } from '../lib/calc';
import { NumInput, TextInput } from './ui';

export function FixtureLibrary({ result }: { result: ProjectResult }) {
  const fixtures = useStore((s) => s.project.fixtures);
  const cosPhiDefault = useStore((s) => s.project.cosPhi);
  const add = useStore((s) => s.addFixture);
  const update = useStore((s) => s.updateFixture);
  const remove = useStore((s) => s.removeFixture);
  const move = useStore((s) => s.moveFixture);

  return (
    <div className="card">
      <h2>Verbraucher</h2>
      <p className="hint">
        Leistung je Stück in Watt. Die Farbe wird in Tabelle, Karten und PDF verwendet. Ein eigener cos&nbsp;φ
        überschreibt den Projektwert ({cosPhiDefault}) bei der Strombelastung.
      </p>
      <table className="list">
        <thead>
          <tr>
            <th style={{ width: 44 }}>Farbe</th>
            <th>Name</th>
            <th className="num">Watt</th>
            <th className="num">cos φ</th>
            <th>Notiz</th>
            <th className="num">im Projekt</th>
            <th style={{ width: 96 }} />
          </tr>
        </thead>
        <tbody>
          {fixtures.map((f) => {
            const used = result.fixtureTotals.get(f.id);
            return (
              <tr key={f.id}>
                <td>
                  <input type="color" value={f.color} onChange={(e) => update(f.id, { color: e.target.value })} />
                </td>
                <td>
                  <TextInput className="inline" value={f.name} onChange={(name) => update(f.id, { name })} style={{ width: '100%' }} />
                </td>
                <td className="num">
                  <NumInput value={f.watt} onChange={(watt) => update(f.id, { watt })} min={0} />
                </td>
                <td className="num">
                  <NumInput
                    value={f.cosPhi ?? 0}
                    onChange={(v) => update(f.id, { cosPhi: v > 0 ? v : undefined })}
                    min={0}
                    max={1}
                    step={0.01}
                    blankZero
                    placeholder={String(cosPhiDefault)}
                    style={{ width: 66 }}
                  />
                </td>
                <td>
                  <TextInput
                    className="inline"
                    value={f.note ?? ''}
                    onChange={(v) => update(f.id, { note: v || undefined })}
                    style={{ width: '100%' }}
                  />
                </td>
                <td className="num" style={{ color: used ? 'var(--text)' : 'var(--muted)' }}>
                  {used ? `${used.qty} Stk · ${fmtWattPlain(used.watt)} W` : '–'}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn icon" title="nach oben" onClick={() => move(f.id, -1)}>
                    ↑
                  </button>{' '}
                  <button className="btn icon" title="nach unten" onClick={() => move(f.id, 1)}>
                    ↓
                  </button>{' '}
                  <button
                    className="btn icon danger"
                    title="löschen"
                    onClick={() =>
                      (!used || confirm(`${f.name} ist ${used.qty}× verplant. Trotzdem löschen?`)) && remove(f.id)
                    }
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={add}>
          + Verbraucher
        </button>
      </div>
    </div>
  );
}

export function CableLibrary() {
  const cableTypes = useStore((s) => s.project.cableTypes);
  const distributors = useStore((s) => s.project.distributors);
  const add = useStore((s) => s.addCableType);
  const update = useStore((s) => s.updateCableType);
  const remove = useStore((s) => s.removeCableType);

  const usage = new Map<string, number>();
  for (const { dist: d } of flattenDistributors({ distributors }))
    for (const b of d.plugboxes)
      if (b.cable) usage.set(b.cable.cableTypeId, (usage.get(b.cable.cableTypeId) ?? 0) + 1);

  return (
    <div className="card">
      <h2>Kabeltypen</h2>
      <p className="hint">
        Querschnitt und Aderzahl bestimmen den Spannungsfall. Ab 4 Adern wird mit der Drehstromformel gerechnet
        (√3 · L · I · cos φ / (κ · A)), darunter mit der Wechselstromformel (2 · L · I · cos φ / (κ · A)).
      </p>
      <table className="list">
        <thead>
          <tr>
            <th>Name</th>
            <th className="num">Querschnitt mm²</th>
            <th className="num">Adern</th>
            <th className="num">Belastbarkeit A</th>
            <th className="num">verwendet</th>
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {cableTypes.map((c) => (
            <tr key={c.id}>
              <td>
                <TextInput className="inline" value={c.name} onChange={(name) => update(c.id, { name })} style={{ width: '100%' }} />
              </td>
              <td className="num">
                <NumInput value={c.crossSectionMm2} onChange={(v) => update(c.id, { crossSectionMm2: v })} min={0} step={0.5} />
              </td>
              <td className="num">
                <NumInput value={c.cores} onChange={(v) => update(c.id, { cores: v })} min={1} style={{ width: 60 }} />
              </td>
              <td className="num">
                <NumInput value={c.maxAmps} onChange={(v) => update(c.id, { maxAmps: v })} min={0} />
              </td>
              <td className="num" style={{ color: usage.get(c.id) ? 'var(--text)' : 'var(--muted)' }}>
                {usage.get(c.id) ? `${usage.get(c.id)}× ` : '–'}
              </td>
              <td style={{ textAlign: 'right' }}>
                <button
                  className="btn icon danger"
                  title="löschen"
                  onClick={() =>
                    (!usage.get(c.id) || confirm(`${c.name} ist ${usage.get(c.id)}× zugewiesen. Trotzdem löschen?`)) &&
                    remove(c.id)
                  }
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={add}>
          + Kabeltyp
        </button>
      </div>
    </div>
  );
}
