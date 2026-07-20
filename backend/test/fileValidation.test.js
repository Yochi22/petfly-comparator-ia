const test = require('node:test');
const assert = require('node:assert/strict');
const { validateUploadedFile } = require('../lib/fileValidation');

test('acepta un archivo con firma PDF real', () => {
  const mime = validateUploadedFile({
    buffer: Buffer.from('%PDF-1.7\ncontenido'),
    mimetype: 'application/pdf',
  });
  assert.equal(mime, 'application/pdf');
});

test('rechaza contenido que finge ser PDF', () => {
  assert.throws(
    () => validateUploadedFile({ buffer: Buffer.from('no es pdf'), mimetype: 'application/pdf' }),
    /no corresponde/i,
  );
});
