const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);

function startsWith(buffer, bytes) {
  return bytes.every((byte, index) => buffer[index] === byte);
}

function detectMimeType(buffer) {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  return null;
}

function validateUploadedFile(file) {
  if (!file?.buffer?.length) {
    const error = new Error('No se recibió un archivo o el archivo está vacío.');
    error.statusCode = 400;
    throw error;
  }

  const detectedMimeType = detectMimeType(file.buffer);
  if (!detectedMimeType || !ALLOWED_MIME_TYPES.has(detectedMimeType)) {
    const error = new Error('El contenido no corresponde a un PDF, PNG o JPG válido.');
    error.statusCode = 415;
    throw error;
  }

  if (file.mimetype && file.mimetype !== detectedMimeType) {
    const error = new Error(`El tipo declarado (${file.mimetype}) no coincide con el contenido (${detectedMimeType}).`);
    error.statusCode = 415;
    throw error;
  }

  return detectedMimeType;
}

module.exports = { validateUploadedFile };
