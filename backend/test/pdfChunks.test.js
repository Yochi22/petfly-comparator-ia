const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const { splitPdfBuffer } = require('../infrastructure/pdfChunks');

test('divide un PDF y conserva todas las páginas en orden', async () => {
  const source = await PDFDocument.create();
  for (let index = 0; index < 5; index += 1) {
    const page = source.addPage([300, 300]);
    page.drawText(`Página ${index + 1}`);
  }
  const buffer = Buffer.from(await source.save());
  const chunks = await splitPdfBuffer(buffer, 10_000);
  assert.deepEqual(chunks.flatMap(chunk => chunk.pageNumbers), [1, 2, 3, 4, 5]);
  assert.equal(chunks.length, 5);
});
