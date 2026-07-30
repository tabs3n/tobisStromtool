import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData, type RowInput } from 'jspdf-autotable';
import type { FixtureType, Project } from '../types';
import { PHASES } from '../types';
import { calcProject, fmtWattPlain, outletName, qtyOf } from './calc';
import { safeFilename } from './projectFile';

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function readableOn([r, g, b]: RGB): RGB {
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? [20, 20, 20] : [255, 255, 255];
}

const INK: RGB = [24, 28, 36];
const MUTED: RGB = [110, 118, 132];
const LINE: RGB = [214, 218, 226];
const DANGER: RGB = [214, 48, 49];
const WARN: RGB = [200, 130, 0];
const GROUP_BG: RGB = [232, 236, 243];

/**
 * Erzeugt den Verteilerplan als PDF und startet den Download.
 * Gibt das jsPDF-Dokument zurück – Basis für spätere Ausgaben wie Kabel-/Plugbox-Labels.
 */
export function exportPlanPdf(project: Project, save = true) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 10;
  const result = calcProject(project);

  let y = margin;

  // ── Kopf ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...INK);
  doc.text(project.name || 'Stromplanung', margin, y + 5);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED);
  const meta = [project.venue, project.date].filter(Boolean).join(' · ');
  if (meta) doc.text(meta, margin, y + 10.5);
  doc.text(
    `${project.voltage} V · cos φ ${project.cosPhi} · erstellt ${new Date().toLocaleString('de-DE')}`,
    pageW - margin,
    y + 5,
    { align: 'right' },
  );
  doc.text(
    `Gesamt ${fmtWattPlain(result.watt)} W · ${result.fixtureCount} Verbraucher`,
    pageW - margin,
    y + 10.5,
    { align: 'right' },
  );
  doc.setDrawColor(...LINE).line(margin, y + 13.5, pageW - margin, y + 13.5);
  y += 18;

  // ── Verteiler ───────────────────────────────────────────────────────────
  for (const dist of project.distributors) {
    const dr = result.distributors.get(dist.id)!;
    const usedFixtures = project.fixtures.filter((f) =>
      dist.plugboxes.some((b) => b.outlets.some((o) => qtyOf(o, f.id) > 0)),
    );

    if (y > doc.internal.pageSize.getHeight() - 45) {
      doc.addPage();
      y = margin;
    }

    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK);
    doc.text(`${dist.name}${dist.model ? ` — ${dist.model}` : ''}`, margin, y + 4);
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED);
    const budget = dist.maxWatt > 0 ? `${fmtWattPlain(dr.watt)} / ${fmtWattPlain(dist.maxWatt)} W` : `${fmtWattPlain(dr.watt)} W`;
    const rest = dist.maxWatt > 0 ? ` · frei ${fmtWattPlain(dr.remainingWatt)} W` : '';
    const phases = PHASES.map((p) => `${p} ${dr.amps[p].toFixed(1)} A`).join('  ');
    doc.setTextColor(...(dr.overBudget || dr.overPhase ? DANGER : MUTED));
    doc.text(
      `${budget}${rest} · ${phases} · Schieflast ${dr.imbalancePct.toFixed(0)} %${dist.maxAmpsPerPhase > 0 ? ` · Sicherung ${dist.maxAmpsPerPhase} A/Phase` : ''}`,
      margin,
      y + 9,
    );
    y += 12;

    const head = [
      ['Abgang', 'Ph', 'Watt', 'A', 'Max W', 'Ausl.', ...usedFixtures.map((f) => f.name)],
    ];
    const body: RowInput[] = [];
    const groupRows: number[] = [];
    const statusByRow = new Map<number, 'over' | 'warn'>();

    for (const box of dist.plugboxes) {
      const br = dr.boxes.get(box.id)!;
      const cableInfo = br.drop
        ? `Zuleitung ${br.drop.cable.name}, ${br.drop.lengthM} m — Spannungsfall ${br.drop.dropPct.toFixed(2)} % (${br.drop.dropV.toFixed(1)} V)`
        : 'Zuleitung nicht definiert';
      groupRows.push(body.length);
      body.push([
        {
          content: `${box.name}   ·   ${fmtWattPlain(br.watt)} W   ·   L1 ${br.amps.L1.toFixed(1)} A / L2 ${br.amps.L2.toFixed(1)} A / L3 ${br.amps.L3.toFixed(1)} A   ·   ${cableInfo}`,
          colSpan: head[0].length,
        },
      ]);

      for (const outlet of box.outlets) {
        const or = br.outlets.get(outlet.id)!;
        if (or.status === 'over' || or.status === 'warn') statusByRow.set(body.length, or.status);
        body.push([
          outletName(box, outlet),
          outlet.phase,
          or.watt ? fmtWattPlain(or.watt) : '',
          or.watt ? or.amps.toFixed(1) : '',
          outlet.maxWatt > 0 ? fmtWattPlain(outlet.maxWatt) : '',
          or.watt && outlet.maxWatt > 0 ? `${Math.round(or.pctOfMax)} %` : '',
          ...usedFixtures.map((f) => {
            const q = qtyOf(outlet, f.id);
            return q > 0 ? String(q) : '';
          }),
        ]);
      }
    }

    const fixtureColStart = 6;
    autoTable(doc, {
      head,
      body,
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: 1.4,
        lineColor: LINE,
        lineWidth: 0.15,
        textColor: INK,
        halign: 'right',
      },
      headStyles: { fillColor: [240, 242, 246], textColor: INK, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { halign: 'left', cellWidth: 24, fontStyle: 'bold' },
        1: { halign: 'center', cellWidth: 9 },
        2: { cellWidth: 16 },
        3: { cellWidth: 12 },
        4: { cellWidth: 16 },
        5: { cellWidth: 14 },
      },
      didParseCell: (data: CellHookData) => {
        if (data.section === 'head' && data.column.index >= fixtureColStart) {
          const f = usedFixtures[data.column.index - fixtureColStart];
          if (f) {
            const rgb = hexToRgb(f.color);
            data.cell.styles.fillColor = rgb;
            data.cell.styles.textColor = readableOn(rgb);
            data.cell.styles.fontSize = 6.2;
          }
        }
        if (data.section === 'body') {
          if (groupRows.includes(data.row.index)) {
            data.cell.styles.fillColor = GROUP_BG;
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.halign = 'left';
            data.cell.styles.fontSize = 7.5;
          } else if (data.column.index <= 5) {
            const st = statusByRow.get(data.row.index);
            if (st) data.cell.styles.textColor = st === 'over' ? DANGER : WARN;
            if (st && data.column.index === 0) data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Stückliste ──────────────────────────────────────────────────────────
  const totals = project.fixtures
    .map((f) => ({ f, t: result.fixtureTotals.get(f.id) }))
    .filter((x): x is { f: FixtureType; t: { qty: number; watt: number } } => !!x.t && x.t.qty > 0);

  if (totals.length) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...INK);
    doc.text('Stückliste', margin, y + 4);
    y += 7;
    autoTable(doc, {
      head: [['Verbraucher', 'W/Stück', 'Stück', 'Gesamt W']],
      body: [
        ...totals.map((x) => [x.f.name, fmtWattPlain(x.f.watt), String(x.t.qty), fmtWattPlain(x.t.watt)]),
        [
          { content: 'Summe', styles: { fontStyle: 'bold' as const } },
          '',
          { content: String(result.fixtureCount), styles: { fontStyle: 'bold' as const } },
          { content: fmtWattPlain(result.watt), styles: { fontStyle: 'bold' as const } },
        ],
      ],
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: 120,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.4, lineColor: LINE, lineWidth: 0.15, halign: 'right' },
      headStyles: { fillColor: [240, 242, 246], textColor: INK, fontStyle: 'bold', halign: 'center' },
      columnStyles: { 0: { halign: 'left', cellWidth: 48 } },
      didParseCell: (data: CellHookData) => {
        if (data.section === 'body' && data.column.index === 0) {
          const entry = totals[data.row.index];
          if (entry) {
            const rgb = hexToRgb(entry.f.color);
            data.cell.styles.fillColor = rgb;
            data.cell.styles.textColor = readableOn(rgb);
          }
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Hinweise ────────────────────────────────────────────────────────────
  if (result.issues.length) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...INK);
    doc.text('Hinweise', margin, y + 4);
    y += 7;
    autoTable(doc, {
      head: [['', 'Bereich', 'Meldung']],
      body: result.issues.map((i) => [i.level === 'error' ? 'Fehler' : 'Warnung', i.scope, i.message]),
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.4, lineColor: LINE, lineWidth: 0.15 },
      headStyles: { fillColor: [240, 242, 246], textColor: INK, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 20, fontStyle: 'bold' }, 1: { cellWidth: 45 } },
      didParseCell: (data: CellHookData) => {
        if (data.section === 'body') {
          const issue = result.issues[data.row.index];
          if (issue) data.cell.styles.textColor = issue.level === 'error' ? DANGER : WARN;
        }
      },
    });
  }

  // ── Seitenzahlen ────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
    doc.text(
      `${project.name || 'Stromplanung'} — Seite ${p}/${pages}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'center' },
    );
  }

  if (save) doc.save(`${safeFilename(project.name)}-verteilerplan.pdf`);
  return doc;
}
