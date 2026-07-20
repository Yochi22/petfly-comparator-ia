const fs = require('node:fs/promises');
const path = require('node:path');
const { PDFDocument } = require('pdf-lib');

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('Uso: node scripts/inspectPdf.js <archivo.pdf> [salida.pdf]');

  const source = await fs.readFile(inputPath);
  const document = await PDFDocument.load(source, { updateMetadata: false });
  const result = {
    filename: path.basename(inputPath),
    pages: document.getPageCount(),
    originalBytes: source.length,
    encrypted: document.isEncrypted,
  };

  if (process.argv.includes('--pages')) {
    result.pagesDetail = [];
    for (let index = 0; index < document.getPageCount(); index += 1) {
      const pageDocument = await PDFDocument.create();
      const [page] = await pageDocument.copyPages(document, [index]);
      pageDocument.addPage(page);
      const pageBytes = await pageDocument.save({ useObjectStreams: true });
      result.pagesDetail.push({ page: index + 1, bytes: pageBytes.length });
    }
  }

  const outputPath = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
  if (outputPath) {
    const rewritten = await document.save({ useObjectStreams: true, addDefaultPage: false });
    await fs.writeFile(outputPath, rewritten);
    result.rewrittenBytes = rewritten.length;
    result.output = path.basename(outputPath);
  }

  console.log(JSON.stringify(result));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
