const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function positiveInteger(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

module.exports = Object.freeze({
  port: positiveInteger('PORT', 3001),
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  geminiTimeoutMs: positiveInteger('GEMINI_TIMEOUT_MS', 120_000),
  googleSheetId: process.env.GOOGLE_SHEET_ID,
  googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY,
  clientCacheTtlMs: positiveInteger('CLIENT_CACHE_TTL_MS', 60_000),
  maxFileBytes: positiveInteger('MAX_FILE_MB', 150) * 1024 * 1024,
  geminiInlineMaxBytes: positiveInteger('GEMINI_INLINE_MAX_MB', 20) * 1024 * 1024,
  geminiPdfMaxBytes: positiveInteger('GEMINI_PDF_MAX_MB', 50) * 1024 * 1024,
  geminiPdfChunkBytes: positiveInteger('GEMINI_PDF_CHUNK_MB', 40) * 1024 * 1024,
  maxConcurrentAudits: positiveInteger('MAX_CONCURRENT_AUDITS', 3),
  auditQueueTimeoutMs: positiveInteger('AUDIT_QUEUE_TIMEOUT_MS', 180_000),
  corsOrigins: (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
});
