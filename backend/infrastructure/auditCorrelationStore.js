const crypto = require('crypto');

class AuditCorrelationStore {
  constructor({ ttlMs = 24 * 60 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.entries = new Map();
  }

  static validateAuditId(value) {
    const auditId = String(value || '').trim();
    return /^[a-zA-Z0-9_-]{16,100}$/.test(auditId) ? auditId : null;
  }

  createId() {
    return crypto.randomUUID();
  }

  put(auditId, clientKey, documentType, reference) {
    this.cleanup();
    const id = AuditCorrelationStore.validateAuditId(auditId);
    if (!id || !['ADI', 'CERTIFICACION_ADI', 'REVISION'].includes(documentType)) return null;
    const previous = this.entries.get(id);
    if (previous && previous.clientKey !== clientKey) {
      const error = new Error('El identificador de auditoría pertenece a otro cliente.');
      error.statusCode = 409;
      throw error;
    }
    const entry = previous || { clientKey, documents: {}, expiresAt: 0 };
    entry.documents[documentType] = { ...reference, updatedAt: new Date().toISOString() };
    entry.expiresAt = Date.now() + this.ttlMs;
    this.entries.set(id, entry);
    return entry;
  }

  get(auditId, clientKey) {
    this.cleanup();
    const id = AuditCorrelationStore.validateAuditId(auditId);
    const entry = id ? this.entries.get(id) : null;
    return entry?.clientKey === clientKey ? entry : null;
  }

  cleanup() {
    const now = Date.now();
    for (const [id, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(id);
  }
}

module.exports = { AuditCorrelationStore };
