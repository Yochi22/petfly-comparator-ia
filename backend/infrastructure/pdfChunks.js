const { PDFDocument } = require('pdf-lib');

async function createChunk(sourceDocument, pageIndexes) {
  const chunk = await PDFDocument.create();
  const pages = await chunk.copyPages(sourceDocument, pageIndexes);
  pages.forEach(page => chunk.addPage(page));
  return Buffer.from(await chunk.save({ useObjectStreams: true }));
}

async function splitPdfBuffer(buffer, maxBytes) {
  const document = await PDFDocument.load(buffer, { updateMetadata: false });
  const pageIndexes = Array.from({ length: document.getPageCount() }, (_, index) => index);
  if (pageIndexes.length === 0) throw new Error('El PDF no contiene páginas.');
  const chunks = [];
  for (const pageIndex of pageIndexes) {
    const pageBuffer = await createChunk(document, [pageIndex]);
    if (pageBuffer.length > maxBytes) {
      const error = new Error(`La página ${pageIndex + 1} supera por sí sola el máximo procesable.`);
      error.code = 'PDF_PAGE_TOO_LARGE';
      throw error;
    }
    chunks.push({ buffer: pageBuffer, pageNumbers: [pageIndex + 1] });
  }
  return chunks;
}

module.exports = { splitPdfBuffer };
