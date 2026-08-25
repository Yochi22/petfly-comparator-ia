const { createCanvas, loadImage } = require('@napi-rs/canvas');
const jsQR = require('jsqr');

function collectUrls(text) {
  return String(text || '').match(/https:\/\/[^\s<>"')\]]+/gi) || [];
}

function decodeCanvas(canvas) {
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data || '';
}

async function decodeQrUrls(buffer, mimeType) {
  const urls = [];
  if (mimeType === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true, useSystemFonts: true });
    const document = await task.promise;
    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.max(1.5, Math.min(3, 2400 / Math.max(base.width, base.height)));
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        urls.push(...collectUrls(decodeCanvas(canvas)));
        page.cleanup();
      }
    } finally {
      await task.destroy();
    }
  } else if (['image/png', 'image/jpeg'].includes(mimeType)) {
    const image = await loadImage(buffer);
    const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
    const canvas = createCanvas(Math.ceil(image.width * scale), Math.ceil(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    urls.push(...collectUrls(decodeCanvas(canvas)));
  }
  return [...new Set(urls)];
}

async function extractEmbeddedHttpsUrls(buffer, mimeType) {
  const urls = [];
  if (mimeType === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true, useSystemFonts: true });
    const document = await task.promise;
    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const annotations = await page.getAnnotations();
        for (const annotation of annotations) urls.push(...collectUrls(annotation.url || annotation.unsafeUrl));
        const text = await page.getTextContent();
        urls.push(...collectUrls(text.items.map(item => item.str).join(' ')));
        page.cleanup();
      }
    } finally {
      await task.destroy();
    }
  }
  urls.push(...await decodeQrUrls(buffer, mimeType));
  return [...new Set(urls.map(url => url.replace(/[.,;]+$/, '')))].slice(0, 10);
}

module.exports = { collectUrls, decodeQrUrls, extractEmbeddedHttpsUrls };
