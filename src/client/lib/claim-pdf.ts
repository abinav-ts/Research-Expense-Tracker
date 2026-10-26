// REQ-CLM-02: the claim pack as a PDF, made on this device from the same ClaimPayload the preview shows. No network.
// Free of browser APIs (pictures arrive already decoded), so it runs in the unit tests too.
import { categoryTotals, type ClaimPayload, type ClaimPayloadItem } from '../../shared/claim.ts';
import { formatDateLabel } from '../../shared/dates.ts';
import { formatMinor } from '../../shared/money.ts';
import { pdfInr, pdfText, SEVERITY_WORDS } from '../../shared/pdf-text.ts';
import { RULE_LABELS } from '../../shared/rules/evaluate.ts';
import { CATEGORY_LABELS, PROOF_TYPE_LABELS } from '../../shared/types.ts';

export interface PdfImage {
  dataUrl: string;
  format: 'JPEG' | 'PNG';
  width: number;
  height: number;
}
export interface PdfProof {
  image?: PdfImage;
  text?: string;
}

const MARGIN = 14;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - 2 * MARGIN;

export async function buildClaimPdf(payload: ClaimPayload, proofs: ReadonlyMap<string, PdfProof>, logo?: PdfImage, options: { compress?: boolean } = {}): Promise<{ bytes: ArrayBuffer; pages: number }> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: options.compress ?? true });
  doc.setProperties({ title: `Claim pack: ${pdfText(payload.trip.name)}`, creator: 'ExpRes' });
  const finalY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? MARGIN;
  const head = { fillColor: 235, textColor: 20, fontStyle: 'bold' as const };

  // ---- cover ----
  let y = MARGIN;
  if (logo) {
    const h = 10;
    doc.addImage(logo.dataUrl, logo.format, MARGIN, y, (h * logo.width) / logo.height, h);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('ExpRes', MARGIN + (h * logo.width) / logo.height + 3, y + 7.5);
  } else {
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('ExpRes', MARGIN, y + 7.5);
  }
  y += 20;
  doc.setFontSize(22);
  doc.text('Claim pack', MARGIN, y);
  y += 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const line = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(pdfText(value), CONTENT_W - 32) as string[];
    doc.text(wrapped, MARGIN + 32, y);
    y += 6 * wrapped.length;
  };
  line('Conference', `${payload.trip.name}, ${payload.trip.city}, ${payload.trip.country}`);
  line('Dates', `${formatDateLabel(payload.trip.startDate)} to ${formatDateLabel(payload.trip.endDate)}`);
  line('Grant', `${payload.grant.name}${payload.grant.sponsor ? ` (${payload.grant.sponsor})` : ''}`);
  line('Claimant', `${payload.claimant.name}, ${payload.claimant.email}${payload.claimant.employeeId ? `, ID ${payload.claimant.employeeId}` : ''}`);
  line('Prepared', payload.preparedAt.slice(0, 10));
  line('Items', String(payload.items.length));
  y += 2;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`Claim total: ${pdfInr(payload.position.thisClaimMinor)}`, MARGIN, y);
  y += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Grant position', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  y += 2;
  const p = payload.position;
  autoTable(doc, {
    startY: y, theme: 'plain', styles: { fontSize: 10, cellPadding: 1 }, margin: { left: MARGIN, right: MARGIN }, tableWidth: 90,
    columnStyles: { 1: { halign: 'right' } },
    body: [
      ['Sanctioned', pdfInr(p.sanctionedMinor)],
      ['Used before ExpRes', pdfInr(p.usedBeforeMinor)],
      ['Spent on other trips', pdfInr(p.otherTripsMinor)],
      ['This claim', pdfInr(p.thisClaimMinor)],
      [p.leftMinor < 0 ? 'Over the grant by' : 'Left after this claim', pdfInr(Math.abs(p.leftMinor))],
    ],
  });
  y = finalY() + 8;
  doc.setFont('helvetica', 'bold');
  doc.text('Declaration', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  y += 5;
  doc.text(doc.splitTextToSize(pdfText(payload.declaration), CONTENT_W) as string[], MARGIN, y);

  // ---- items ----
  doc.addPage();
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Items', MARGIN, MARGIN + 4);
  const statementText = (i: ClaimPayloadItem) =>
    i.statementRef
      ? `${formatDateLabel(i.statementRef.date)}, ${i.statementRef.narration}${i.statementRef.refNo ? `, ref ${i.statementRef.refNo}` : ''}`
      : `Cash. ${i.justification ?? 'No justification given.'}`;
  autoTable(doc, {
    startY: MARGIN + 8, margin: { left: MARGIN, right: MARGIN }, showHead: 'everyPage', theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.8, overflow: 'linebreak', textColor: 20, lineColor: 190 }, headStyles: head,
    head: [['#', 'Date', 'Description', 'Category', 'Claimed', 'Paid', 'Statement line / cash']],
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 22 }, 4: { halign: 'right', cellWidth: 25 }, 5: { halign: 'right', cellWidth: 22 } },
    body: payload.items.map((i, n) => [
      String(n + 1), formatDateLabel(i.date), pdfText(i.description), i.categoryId ? CATEGORY_LABELS[i.categoryId] : 'None', pdfInr(i.amountMinor),
      i.originalCurrency === 'INR' ? '' : pdfText(formatMinor(i.originalMinor, i.originalCurrency, 2)), pdfText(statementText(i)),
    ]),
  });
  y = finalY() + 8;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  if (y > PAGE_H - 50) { doc.addPage(); y = MARGIN + 4; }
  doc.text('By category', MARGIN, y);
  autoTable(doc, {
    startY: y + 3, margin: { left: MARGIN, right: MARGIN }, theme: 'grid', tableWidth: 110, styles: { fontSize: 9, cellPadding: 1.8, textColor: 20, lineColor: 190 }, headStyles: head,
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
    head: [['Category', 'Items', 'Total']],
    body: categoryTotals(payload.items).map((c) => [c.label, String(c.count), pdfInr(c.totalMinor)]),
    foot: [['All', String(payload.items.length), pdfInr(payload.position.thisClaimMinor)]],
    footStyles: head,
  });
  y = finalY() + 8;

  // ---- flags (only when there are some) ----
  const flagged = payload.items.map((i, n) => ({ n: n + 1, i })).filter(({ i }) => i.flags.length > 0 || i.missingProofs > 0);
  if (flagged.length > 0) {
    if (y > PAGE_H - 50) { doc.addPage(); y = MARGIN + 4; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Flags and notes', MARGIN, y);
    autoTable(doc, {
      startY: y + 3, margin: { left: MARGIN, right: MARGIN }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.8, textColor: 20, lineColor: 190 }, headStyles: head,
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 34 }, 2: { cellWidth: 22 } },
      head: [['#', 'Item', 'Level', 'What']],
      body: flagged.flatMap(({ n, i }) => [
        ...i.flags.map((f) => [String(n), pdfText(i.description), SEVERITY_WORDS[f.severity], pdfText(`${RULE_LABELS[f.ruleId] ?? f.ruleId}: ${f.message}`)]),
        ...(i.missingProofs > 0 ? [[String(n), pdfText(i.description), 'Warning', `${i.missingProofs} proof(s) not included (too large to send).`]] : []),
      ]),
    });
  }

  // ---- proofs ----
  const byId = new Map(payload.files.map((f) => [f.id, f]));
  const withProofs = payload.items.map((i, n) => ({ n: n + 1, i })).filter(({ i }) => i.fileIds.length > 0);
  const docs = payload.files.filter((f) => f.kind === 'grant_doc');
  if (withProofs.length > 0 || docs.length > 0) {
    doc.addPage();
    y = MARGIN + 4;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Proofs', MARGIN, y);
    y += 8;
    const room = (needed: number) => {
      if (y + needed > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN + 4; }
    };
    const place = (title: string, fileId: string) => {
      const meta = byId.get(fileId);
      if (!meta) return;
      const proof = proofs.get(fileId);
      room(14);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(pdfText(title), MARGIN, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      const caption = `${meta.proofType ? PROOF_TYPE_LABELS[meta.proofType] : meta.kind === 'grant_doc' ? 'Grant document' : 'Proof'}: ${meta.name}`;
      doc.text(pdfText(caption), MARGIN, y);
      y += 5;
      if (proof?.image) {
        const maxH = 150;
        // Natural size at 96 dpi, kept inside the page width and the height limit.
        let w = Math.min(CONTENT_W, proof.image.width * 0.2646);
        let h = (w * proof.image.height) / proof.image.width;
        if (h > maxH) { w = (maxH * w) / h; h = maxH; }
        const fit = { w, h };
        room(fit.h + 4);
        doc.addImage(proof.image.dataUrl, proof.image.format, MARGIN, y, fit.w, fit.h);
        y += fit.h + 6;
      } else if (proof?.text !== undefined) {
        doc.setFontSize(9);
        const lines = doc.splitTextToSize(pdfText(proof.text), CONTENT_W) as string[];
        for (const l of lines) { room(5); doc.text(l, MARGIN, y); y += 4.2; }
        y += 4;
      } else {
        doc.text(meta.mime === 'application/pdf' ? 'PDF file: it is included with the claim in the app, not inside this pack.' : 'File not shown in this pack.', MARGIN, y);
        y += 8;
      }
    };
    for (const { n, i } of withProofs) for (const id of i.fileIds) place(`Item ${n}: ${i.description}`, id);
    for (const f of docs) place('Grant document', f.id);
  }

  // ---- page numbers ----
  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`ExpRes claim pack · ${pdfText(payload.trip.name)} · page ${n} of ${pages}`, MARGIN, PAGE_H - 7);
  }
  return { bytes: doc.output('arraybuffer'), pages };
}
