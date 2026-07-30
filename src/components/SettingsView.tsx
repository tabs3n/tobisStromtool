import { useStore } from '../store';
import { NumInput } from './ui';

export function SettingsView() {
  const p = useStore((s) => s.project);
  const patch = useStore((s) => s.patchProject);

  return (
    <>
      <div className="card">
        <h2>Netz &amp; Berechnung</h2>
        <p className="hint">
          Ströme werden als I = P / (U · cos φ) berechnet. κ ist die Leitfähigkeit für den Spannungsfall: 56 für
          Kupfer bei 20 °C, betriebswarm eher 48 – der kleinere Wert rechnet konservativer.
        </p>
        <div className="settings-grid">
          <label className="field">
            <span>Spannung L–N (V)</span>
            <NumInput value={p.voltage} onChange={(voltage) => patch({ voltage })} min={1} />
          </label>
          <label className="field">
            <span>cos φ (Projekt)</span>
            <NumInput value={p.cosPhi} onChange={(cosPhi) => patch({ cosPhi })} min={0.1} max={1} step={0.01} />
          </label>
          <label className="field">
            <span>κ Leitfähigkeit</span>
            <NumInput value={p.conductivity} onChange={(conductivity) => patch({ conductivity })} min={1} step={1} />
          </label>
          <label className="field">
            <span>Max. Spannungsfall (%)</span>
            <NumInput
              value={p.maxVoltageDropPct}
              onChange={(maxVoltageDropPct) => patch({ maxVoltageDropPct })}
              min={0}
              step={0.5}
            />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Vorgaben für neue Plugboxen</h2>
        <p className="hint">
          Gilt für neu angelegte Plugboxen und Abgänge. Bestehende Abgänge behalten ihre Werte – die lassen sich
          einzeln im Abgangs-Dialog oder in der Tabellenansicht ändern.
        </p>
        <div className="settings-grid">
          <label className="field">
            <span>Abgänge je Plugbox</span>
            <NumInput value={p.outletsPerBox} onChange={(outletsPerBox) => patch({ outletsPerBox })} min={1} max={24} />
          </label>
          <label className="field">
            <span>Absicherung je Abgang (A)</span>
            <NumInput
              value={p.defaultBreakerAmps}
              onChange={(defaultBreakerAmps) => patch({ defaultBreakerAmps })}
              min={1}
            />
          </label>
          <label className="field">
            <span>Ziel-Maximum je Abgang (W)</span>
            <NumInput
              value={p.defaultOutletMaxWatt}
              onChange={(defaultOutletMaxWatt) => patch({ defaultOutletMaxWatt })}
              min={0}
              step={100}
            />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Speicherung</h2>
        <p className="hint">
          Das Projekt liegt automatisch im Browser-Speicher dieses Rechners. Für Backups und zum Weitergeben
          „Speichern" benutzen – das legt eine <code>.stromtool.json</code> ab, die sich über „Öffnen" wieder laden
          lässt.
        </p>
      </div>
    </>
  );
}
