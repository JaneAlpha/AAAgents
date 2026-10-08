/** 用 pdf-lib 生成一份规范 PDF 夹具（英文事实，避免 CJK 字体编码问题），并自检可解析。 */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const HERE = dirname(fileURLToPath(import.meta.url));

const LINES = [
  'Inventory and Market Note',
  'Company: apple trading, inventory 240 tons, grade A red fuji, Qixia warehouse.',
  'Quotes: AP2612 settle 8500 CNY per ton; AP2701 settle 8620 CNY per ton.',
  'Hedge horizon: 2026-12-15. No derivative positions currently held.',
];

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const page = doc.addPage([595, 842]);
let y = 780;
for (const line of LINES) {
  page.drawText(line, { x: 50, y, size: 12, font });
  y -= 20;
}
const bytes = await doc.save();

const target = join(HERE, 'inventory.pdf');
writeFileSync(target, bytes);

const pdfParse = (await import('pdf-parse')).default;
const parsed = await pdfParse(Buffer.from(bytes));
if (!parsed.text.includes('8500')) {
  console.error('自检失败：解析结果不含 8500 →', JSON.stringify(parsed.text.slice(0, 150)));
  process.exit(1);
}
console.log(`wrote ${target} (${bytes.length} bytes), parsed ${parsed.text.length} chars, 含 8500 ✓`);
