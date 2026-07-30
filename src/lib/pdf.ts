import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData, type RowInput } from 'jspdf-autotable';
import type { FixtureType, Project } from '../types';
import { PHASES } from '../types';
import { calcProject, fmtWattPlain, outletName, qtyOf } from './calc';
import { safeFilename } from './projectFile';

type RGB = [number, number, number];

const INK: RGB = [23, 28, 38];
const SUB: RGB = [112, 120, 134];
const LINE: RGB = [212, 217, 226];
const PANEL: RGB = [243, 245, 249];
const TRACK: RGB = [224, 228, 236];
const ACCENT: RGB = [43, 108, 196];
const OK: RGB = [46, 158, 90];
const WARN: RGB = [204, 146, 0];
const DANGER: RGB = [202, 44, 46];
const WHITE: RGB = [255, 255, 255];

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
}

function readableOn([r, g, b]: RGB): RGB {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? [20, 20, 20] : WHITE;
}

/** Ampelfarbe nach Auslastung in Prozent. */
function loadColor(pct: number): RGB {
  if (pct > 100) return DANGER;
  if (pct > 85) return WARN;
  return OK;
}

const kW = (w: number) => `${(w / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} kW`;

export function exportPlanPdf(project: Project, save = true) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 10;
  const CW = W - 2 * M;
  const result = calcProject(project);
  let y = M;

  const ensure = (need: number) => {
    if (y + need > H - 12) {
      doc.addPage();
      y = M;
    }
  };

  // ── Kennzahl-Kachel ─────────────────────────────────────────────────────
  const statCell = (x: number, top: number, label: string, value: string, color: RGB = INK) => {
    doc.setFont('helvetica', 'normal').setFontSize(6.4).setTextColor(...SUB);
    doc.text(label.toUpperCase(), x, top);
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...color);
    doc.text(value, x, top + 5.2);
  };

  // ── Balken mit Beschriftung ─────────────────────────────────────────────
  const barRow = (
    x: number,
    top: number,
    barW: number,
    label: string,
    pct: number,
    value: string,
    color: RGB,
    limitPct?: number | null,
  ) => {
    const h = 3.4;
    doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(...SUB);
    doc.text(label, x, top + 2.7);
    const bx = x + 9;
    doc.setFillColor(...TRACK);
    doc.roundedRect(bx, top, barW, h, h / 2, h / 2, 'F');
    const fw = (Math.min(100, Math.max(0, pct)) / 100) * barW;
    if (fw > 0.8) {
      doc.setFillColor(...color);
      doc.roundedRect(bx, top, fw, h, h / 2, h / 2, 'F');
    }
    if (limitPct != null && limitPct > 0 && limitPct < 100) {
      doc.setDrawColor(120, 128, 142).setLineWidth(0.35);
      doc.line(bx + (limitPct / 100) * barW, top - 0.7, bx + (limitPct / 100) * barW, top + h + 0.7);
    }
    doc.setFont('helvetica', 'normal').setFontSize(7.4).setTextColor(...INK);
    doc.text(value, bx + barW + 3, top + 2.7);
  };

  const pill = (x: number, top: number, text: string, color: RGB) => {
    doc.setFont('helvetica', 'bold').setFontSize(7.4);
    const w = doc.getTextWidth(text) + 6;
    doc.setFillColor(...mix(color, WHITE, 0.84));
    doc.roundedRect(x - w, top, w, 5.4, 2.7, 2.7, 'F');
    doc.setTextColor(...color);
    doc.text(text, x - w / 2, top + 3.7, { align: 'center' });
  };

  // ══ Kopf ════════════════════════════════════════════════════════════════
  doc.setFillColor(...ACCENT);
  doc.rect(M, y, 34, 1.6, 'F');
  y += 6;
  doc.setFont('helvetica', 'bold').setFontSize(19).setTextColor(...INK);
  doc.text(project.name || 'Stromplanung', M, y + 2);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...SUB);
  const meta = [project.venue, project.date].filter(Boolean).join('   ·   ');
  if (meta) doc.text(meta, M, y + 8);
  doc.text(`${project.voltage} V · cos φ ${project.cosPhi} · κ ${project.conductivity}`, W - M, y - 1, {
    align: 'right',
  });
  doc.text(`erstellt ${new Date().toLocaleString('de-DE')}`, W - M, y + 3.5, { align: 'right' });
  y += meta ? 12 : 8;

  // ══ Kennzahlen ══════════════════════════════════════════════════════════
  const boxCount = project.distributors.reduce((n, d) => n + d.plugboxes.length, 0);
  const outlets = project.distributors.flatMap((d) => d.plugboxes.flatMap((b) => b.outlets));
  const usedOutlets = outlets.filter((o) => o.loads.length > 0).length;
  const kpis: [string, string][] = [
    ['Gesamtleistung', kW(result.watt)],
    ['Verbraucher', `${result.fixtureCount} Stk.`],
    ['Verteiler', String(project.distributors.length)],
    ['Plugboxen', String(boxCount)],
    ['Abgänge belegt', `${usedOutlets} / ${outlets.length}`],
  ];
  const kpiW = (CW - 4 * 3) / 5;
  doc.setFillColor(...PANEL);
  kpis.forEach((_, i) => doc.roundedRect(M + i * (kpiW + 3), y, kpiW, 15, 1.6, 1.6, 'F'));
  kpis.forEach(([label, value], i) => statCell(M + i * (kpiW + 3) + 4, y + 5.6, label, value));
  y += 20;

  // ══ Legende ═════════════════════════════════════════════════════════════
  const legend = project.fixtures.filter((f) => (result.fixtureTotals.get(f.id)?.qty ?? 0) > 0);
  if (legend.length) {
    doc.setFont('helvetica', 'normal').setFontSize(6.4).setTextColor(...SUB);
    doc.text('VERBRAUCHER', M, y);
    let lx = M;
    let ly = y + 4.5;
    doc.setFontSize(7.6);
    for (const f of legend) {
      const total = result.fixtureTotals.get(f.id)!;
      const text = `${f.name}  ${f.watt} W  ·  ${total.qty}×`;
      const chipW = doc.getTextWidth(text) + 9;
      if (lx + chipW > W - M) {
        lx = M;
        ly += 6;
      }
      doc.setFillColor(...hexToRgb(f.color));
      doc.roundedRect(lx, ly - 3, 3.2, 3.2, 0.6, 0.6, 'F');
      doc.setTextColor(...INK).setFont('helvetica', 'normal');
      doc.text(text, lx + 5, ly - 0.4);
      lx += chipW;
    }
    y = ly + 5;
  }

  doc.setDrawColor(...LINE).setLineWidth(0.3).line(M, y, W - M, y);
  y += 6;

  // ══ Verteiler ═══════════════════════════════════════════════════════════
  for (const dist of project.distributors) {
    const dr = result.distributors.get(dist.id)!;
    const usedFixtures = project.fixtures.filter((f) =>
      dist.plugboxes.some((b) => b.outlets.some((o) => qtyOf(o, f.id) > 0)),
    );

    ensure(58);

    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...INK);
    doc.text(dist.name, M, y + 3);
    const nameW = doc.getTextWidth(dist.name);
    if (dist.model) {
      doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...SUB);
      doc.text(`— ${dist.model}`, M + nameW + 3, y + 3);
    }
    const worst = Math.max(dr.pctOfBudget, dr.pctOfPhaseLimit);
    pill(
      W - M,
      y - 1.4,
      dr.overBudget || dr.overPhase ? 'überlastet' : `${Math.round(worst)} % ausgelastet`,
      loadColor(worst),
    );
    y += 6;

    // Panel mit Kennzahlen und Balken
    const panelH = 40;
    doc.setFillColor(...PANEL);
    doc.roundedRect(M, y, CW, panelH, 2, 2, 'F');

    const stats: [string, string, RGB][] = [
      ['Budget', dist.maxWatt > 0 ? kW(dist.maxWatt) : 'ohne', INK],
      ['Belegt', kW(dr.watt), dr.overBudget ? DANGER : INK],
      ['Frei', dist.maxWatt > 0 ? kW(dr.remainingWatt) : '–', dr.remainingWatt < 0 ? DANGER : INK],
      ['Absicherung', dist.maxAmpsPerPhase > 0 ? `${dist.maxAmpsPerPhase} A / Phase` : 'ohne', INK],
      ['Schieflast', dr.maxPhaseAmps > 0 ? `${Math.round(dr.imbalancePct)} %` : '–', dr.imbalancePct > 25 ? WARN : INK],
      ['Plugboxen', `${dist.plugboxes.length}`, INK],
      ['Verbraucher', `${dr.fixtureCount} Stk.`, INK],
    ];
    const statW = (CW - 8) / stats.length;
    stats.forEach(([label, value, color], i) => statCell(M + 5 + i * statW, y + 6, label, value, color));

    const barW = CW - 9 - 5 - 52;
    let by = y + 17.5;
    if (dist.maxWatt > 0) {
      barRow(
        M + 5,
        by,
        barW,
        'kW',
        dr.pctOfBudget,
        `${fmtWattPlain(dr.watt)} / ${fmtWattPlain(dist.maxWatt)} W`,
        loadColor(dr.pctOfBudget),
      );
      by += 5.2;
    }
    for (const p of PHASES) {
      const a = dr.amps[p];
      const pct = dist.maxAmpsPerPhase > 0 ? (a / dist.maxAmpsPerPhase) * 100 : 0;
      barRow(
        M + 5,
        by,
        barW,
        p,
        pct,
        dist.maxAmpsPerPhase > 0
          ? `${a.toFixed(1)} A / ${dist.maxAmpsPerPhase} A   (${Math.round(pct)} %)`
          : `${a.toFixed(1)} A`,
        loadColor(pct),
      );
      by += 5.2;
    }
    y += panelH + 5;

    // ── Abgangstabelle ────────────────────────────────────────────────────
    const headRow: string[] = [
      'Abgang',
      'Ph',
      'Watt',
      'A',
      'Ziel W',
      'Auslastung',
      ...usedFixtures.map((f) => `${f.name}\n${f.watt} W`),
    ];
    const LAST_COL = 5;
    const FX_START = 6;
    const body: RowInput[] = [];
    const groupRows = new Set<number>();
    const barMeta = new Map<number, { pct: number; limitPct: number | null; over: boolean }>();
    const overRows = new Set<number>();

    for (const box of dist.plugboxes) {
      const br = dr.boxes.get(box.id)!;
      const cable = br.drop
        ? `${br.drop.cable.name}, ${br.drop.lengthM} m · ΔU ${br.drop.dropPct.toFixed(2)} % (${br.drop.dropV.toFixed(1)} V)`
        : 'Zuleitung nicht definiert';
      groupRows.add(body.length);
      body.push([
        {
          content: `${box.name}      ${fmtWattPlain(br.watt)} W  ·  ${br.fixtureCount} Verbraucher  ·  L1 ${br.amps.L1.toFixed(1)} A / L2 ${br.amps.L2.toFixed(1)} A / L3 ${br.amps.L3.toFixed(1)} A      ${cable}`,
          colSpan: headRow.length,
        },
      ]);

      for (const outlet of box.outlets) {
        const or = br.outlets.get(outlet.id)!;
        const breakerWatt = outlet.breakerAmps * project.voltage * project.cosPhi;
        barMeta.set(body.length, {
          pct: or.pctOfBreaker,
          limitPct: outlet.maxWatt > 0 && breakerWatt > 0 ? (outlet.maxWatt / breakerWatt) * 100 : null,
          over: or.status === 'over',
        });
        if (or.status === 'over') overRows.add(body.length);
        body.push([
          outletName(box, outlet),
          outlet.phase,
          or.watt ? fmtWattPlain(or.watt) : '',
          or.watt ? or.amps.toFixed(1) : '',
          outlet.maxWatt > 0 ? fmtWattPlain(outlet.maxWatt) : '',
          '',
          ...usedFixtures.map((f) => {
            const q = qtyOf(outlet, f.id);
            return q > 0 ? String(q) : '';
          }),
        ]);
      }
    }

    autoTable(doc, {
      head: [headRow],
      body,
      startY: y,
      margin: { left: M, right: M },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.4,
        cellPadding: 1.5,
        lineColor: LINE,
        lineWidth: 0.15,
        textColor: INK,
        halign: 'right',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [236, 239, 244],
        textColor: INK,
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 6.6,
      },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      columnStyles: {
        0: { halign: 'left', cellWidth: 24, fontStyle: 'bold' },
        1: { halign: 'center', cellWidth: 8 },
        2: { cellWidth: 15 },
        3: { cellWidth: 11 },
        4: { cellWidth: 15 },
        5: { cellWidth: 30 },
      },
      didParseCell: (data: CellHookData) => {
        if (data.section === 'head' && data.column.index >= FX_START) {
          const f = usedFixtures[data.column.index - FX_START];
          if (f) {
            const c = hexToRgb(f.color);
            data.cell.styles.fillColor = c;
            data.cell.styles.textColor = readableOn(c);
          }
        }
        if (data.section !== 'body') return;
        if (groupRows.has(data.row.index)) {
          data.cell.styles.fillColor = [224, 231, 241];
          data.cell.styles.textColor = [38, 52, 74];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.halign = 'left';
          return;
        }
        if (data.column.index >= FX_START) {
          const f = usedFixtures[data.column.index - FX_START];
          if (f) {
            const filled = String(data.cell.raw ?? '') !== '';
            data.cell.styles.fillColor = mix(hexToRgb(f.color), WHITE, filled ? 0.6 : 0.9);
            if (filled) data.cell.styles.fontStyle = 'bold';
          }
        } else if (overRows.has(data.row.index) && data.column.index <= 3) {
          // Nur echte Überlast markieren – das eigene Ziel-Maximum ist Planungshilfe.
          data.cell.styles.textColor = DANGER;
          data.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawCell: (data: CellHookData) => {
        if (data.section !== 'body' || data.column.index !== LAST_COL) return;
        const meta = barMeta.get(data.row.index);
        if (!meta) return;
        const h = 2.6;
        const bx = data.cell.x + 2;
        const bw = data.cell.width - 4;
        const by2 = data.cell.y + (data.cell.height - h) / 2;
        doc.setFillColor(...TRACK);
        doc.roundedRect(bx, by2, bw, h, h / 2, h / 2, 'F');
        const fw = (Math.min(100, Math.max(0, meta.pct)) / 100) * bw;
        if (fw > 0.6) {
          doc.setFillColor(...(meta.over ? DANGER : OK));
          doc.roundedRect(bx, by2, fw, h, h / 2, h / 2, 'F');
        }
        if (meta.limitPct != null && meta.limitPct > 0 && meta.limitPct < 100) {
          doc.setDrawColor(150, 157, 170).setLineWidth(0.3);
          doc.line(bx + (meta.limitPct / 100) * bw, by2 - 0.5, bx + (meta.limitPct / 100) * bw, by2 + h + 0.5);
        }
      },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // ══ Stückliste ══════════════════════════════════════════════════════════
  const totals = project.fixtures
    .map((f) => ({ f, t: result.fixtureTotals.get(f.id) }))
    .filter((x): x is { f: FixtureType; t: { qty: number; watt: number } } => !!x.t && x.t.qty > 0);

  if (totals.length) {
    ensure(30);
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...INK);
    doc.text('Stückliste', M, y + 3);
    y += 7;
    autoTable(doc, {
      head: [['Verbraucher', 'W / Stück', 'Stück', 'Gesamt', 'Anteil']],
      body: [
        ...totals.map((x) => [
          x.f.name,
          fmtWattPlain(x.f.watt),
          String(x.t.qty),
          `${fmtWattPlain(x.t.watt)} W`,
          result.watt > 0 ? `${Math.round((x.t.watt / result.watt) * 100)} %` : '',
        ]),
        [
          { content: 'Summe', styles: { fontStyle: 'bold' as const } },
          '',
          { content: String(result.fixtureCount), styles: { fontStyle: 'bold' as const } },
          { content: `${fmtWattPlain(result.watt)} W`, styles: { fontStyle: 'bold' as const } },
          '',
        ],
      ],
      startY: y,
      margin: { left: M, right: M },
      tableWidth: 148,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, lineColor: LINE, lineWidth: 0.15, halign: 'right' },
      headStyles: { fillColor: [236, 239, 244], textColor: INK, fontStyle: 'bold', halign: 'center' },
      columnStyles: { 0: { halign: 'left', cellWidth: 52 } },
      didParseCell: (data: CellHookData) => {
        if (data.section === 'body' && data.column.index === 0) {
          const entry = totals[data.row.index];
          if (entry) {
            const c = hexToRgb(entry.f.color);
            data.cell.styles.fillColor = c;
            data.cell.styles.textColor = readableOn(c);
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // ══ Hinweise ════════════════════════════════════════════════════════════
  // Das selbst gesetzte Ziel-Maximum je Abgang ist Planungshilfe und gehört nicht in den Report.
  const reported = result.issues.filter((i) => i.code !== 'outlet-target');

  ensure(24);
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...INK);
  doc.text('Hinweise', M, y + 3);
  y += 7;

  if (reported.length === 0) {
    doc.setFillColor(...mix(OK, WHITE, 0.88));
    doc.roundedRect(M, y, 110, 9, 1.6, 1.6, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...OK);
    doc.text('Keine Auffälligkeiten – alle Grenzwerte eingehalten.', M + 4, y + 5.8);
  } else {
    autoTable(doc, {
      head: [['', 'Bereich', 'Meldung']],
      body: reported.map((i) => [i.level === 'error' ? 'Fehler' : 'Warnung', i.scope, i.message]),
      startY: y,
      margin: { left: M, right: M },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, lineColor: LINE, lineWidth: 0.15 },
      headStyles: { fillColor: [236, 239, 244], textColor: INK, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 20, fontStyle: 'bold' }, 1: { cellWidth: 48, fontStyle: 'bold' } },
      didParseCell: (data: CellHookData) => {
        if (data.section === 'body') {
          const issue = reported[data.row.index];
          if (!issue) return;
          const color = issue.level === 'error' ? DANGER : WARN;
          if (data.column.index === 0) {
            data.cell.styles.textColor = color;
            data.cell.styles.fillColor = mix(color, WHITE, 0.9);
          }
        }
      },
    });
  }

  // ══ Fußzeile ════════════════════════════════════════════════════════════
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE).setLineWidth(0.3).line(M, H - 9, W - M, H - 9);
    doc.setFont('helvetica', 'normal').setFontSize(7.2).setTextColor(...SUB);
    doc.text(project.name || 'Stromplanung', M, H - 5);
    doc.text(`Seite ${p} / ${pages}`, W - M, H - 5, { align: 'right' });
  }

  if (save) doc.save(`${safeFilename(project.name)}-verteilerplan.pdf`);
  return doc;
}
