const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const { optimizePdfBuffer } = require('../infrastructure/pdfOptimizer');

test('rasteriza un PDF conservando el número de páginas', async () => {
  const source = await PDFDocument.create();
  source.addPage([300, 400]).drawText('Página de prueba');
  source.addPage([400, 300]).drawText('Segunda página');
  const optimized = await optimizePdfBuffer(Buffer.from(await source.save()), { scale: 1, jpegQuality: 70 });
  const result = await PDFDocument.load(optimized);
  assert.equal(result.getPageCount(), 2);
});
