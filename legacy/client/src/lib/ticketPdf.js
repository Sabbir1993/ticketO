// PDF M-ticket + money receipt, generated in the browser.
import { fmtDate, fmtTime } from './utils';
const tk = (n) => `BDT ${Math.round(n).toLocaleString('en-IN')}`;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export async function downloadTicketPdf(o) {
  const [{ jsPDF }, QR] = await Promise.all([import('jspdf'), import('qrcode')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' }); const W = 210; const e = o.event; const v = o.venue;
  for (let i = 0; i < o.tickets.length; i++) {
    const t = o.tickets[i]; const y0 = 14 + (i % 3) * 92;
    if (i > 0 && i % 3 === 0) doc.addPage();
    doc.setDrawColor(220); doc.setLineDashPattern([], 0); doc.roundedRect(14, y0, W - 28, 86, 4, 4);
    doc.setFillColor(...hex(e.palette[0])); doc.roundedRect(14, y0, 56, 86, 4, 4, 'F'); doc.rect(60, y0, 10, 86, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('TICKETO', 20, y0 + 10);
    doc.setFontSize(15); doc.text(doc.splitTextToSize(e.title.toUpperCase(), 44), 20, y0 + 24);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(`${(e.subCategory || e.category).toUpperCase()}`, 20, y0 + 78);
    doc.setTextColor(30); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(`${fmtDate(o.showDate)}  |  ${fmtTime(o.showDate)}`, 78, y0 + 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90); doc.text(doc.splitTextToSize(`${v?.name || ''}, ${v?.address || ''}`, 70), 78, y0 + 21);
    doc.setTextColor(30); doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text(t.label, 78, y0 + 38);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
    doc.text(`${t.tier || ''} · Ticket ${i + 1} of ${o.tickets.length}`, 78, y0 + 44); doc.text(`Booking ID: ${o.id}`, 78, y0 + 56); doc.text(`Ticket code: ${t.code}`, 78, y0 + 62); doc.text(`Holder: ${o.contact?.name || '-'}  ${o.contact?.phone || ''}`, 78, y0 + 68);
    doc.setFontSize(7); doc.text('Show this QR at the entry gate. Each code admits one person once.', 78, y0 + 80);
    doc.setLineDashPattern([1.5, 1.5], 0); doc.line(150, y0 + 4, 150, y0 + 82);
    doc.addImage(await QR.toDataURL(t.code, { width: 300, margin: 1 }), 'PNG', 155, y0 + 14, 36, 36);
    doc.setFontSize(8); doc.setTextColor(30); doc.text(t.code, 173, y0 + 56, { align: 'center' });
  }
  doc.addPage(); doc.setLineDashPattern([], 0);
  doc.setTextColor(30); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Money Receipt', 14, 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90); doc.text(`Ticketo · on behalf of ${e.merchant?.name || 'the organiser'}`, 14, 29);
  const rows = [['Receipt no.', `RCPT-${o.id.slice(4)}`], ['Booking ID', o.id], ['Date', `${fmtDate(o.createdAt, { year: true })} ${fmtTime(o.createdAt)}`], ['Customer', `${o.contact?.name || ''} · ${o.contact?.phone || ''}`], ['Event', e.title], ['Payment', `${o.payment?.method || ''} via ${o.payment?.gateway || ''}`], ['Reference', o.payment?.ref || '-']];
  let y = 42; doc.setFontSize(10);
  rows.forEach(([k, val]) => { doc.setTextColor(110); doc.text(k, 14, y); doc.setTextColor(30); doc.text(String(val), 70, y); y += 7; });
  y += 4; doc.setDrawColor(220); doc.line(14, y, W - 14, y); y += 8;
  const a = o.amounts;
  const lines = [...o.items.map((it) => [`${it.blockName}${it.type === 'seat' ? ` ${it.seat}` : ''} x ${it.qty}`, it.price * it.qty]), ...(a.discount ? [[`Promo ${o.promo}`, -a.discount]] : []), ['Convenience fee (incl. VAT)', a.fee]];
  lines.forEach(([k, val]) => { doc.text(k, 14, y); doc.text(tk(val), W - 14, y, { align: 'right' }); y += 7; });
  doc.line(14, y, W - 14, y); y += 8; doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Total paid', 14, y); doc.text(tk(a.total), W - 14, y, { align: 'right' });
  doc.save(`Ticketo-${o.id}.pdf`);
}

export function downloadIcs(o) {
  const d = new Date(o.showDate); const f = (x) => `${x.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ticketo//EN', 'BEGIN:VEVENT', `UID:${o.id}@ticketo`, `DTSTART:${f(d)}`, `DTEND:${f(new Date(d.getTime() + 3 * 3600000))}`, `SUMMARY:${o.event.title}`, `LOCATION:${o.venue?.name || ''}`, `DESCRIPTION:Booking ${o.id}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); el.download = `${o.event.slug}.ics`; el.click();
}
