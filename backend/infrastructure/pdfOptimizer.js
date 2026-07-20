const { createCanvas } = require('@napi-rs/canvas');
const { PDFDocument } = require('pdf-lib');

async function optimizePdfBuffer(buffer, { scale = 2, jpegQuality = 82 } = {}) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useSystemFonts: true,
  });
  const source = await loadingTask.promise;
  const output = await PDFDocument.create();

  try {
    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
      const sourcePage = await source.getPage(pageNumber);
      const viewport = sourcePage.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      await sourcePage.render({ canvasContext: context, viewport }).promise;
      const jpeg = await canvas.encode('jpeg', jpegQuality);
      const image = await output.embedJpg(jpeg);
      const page = output.addPage([viewport.width / scale, viewport.height / scale]);
      page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
      sourcePage.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return Buffer.from(await output.save({ useObjectStreams: true }));
}

module.exports = { optimizePdfBuffer };
