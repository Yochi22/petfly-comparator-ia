const axios = require('axios');
const { splitPdfBuffer } = require('./pdfChunks');
const { optimizePdfBuffer } = require('./pdfOptimizer');

const RESPONSE_SCHEMA = Object.freeze({
  type: 'OBJECT',
  required: ['is_valid', 'score', 'final_verdict', 'analysis', 'findings'],
  properties: {
    is_valid: { type: 'BOOLEAN' },
    score: { type: 'NUMBER' },
    final_verdict: { type: 'STRING' },
    findings: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['code', 'category', 'severity', 'status', 'expected', 'found', 'message'],
        properties: {
          code: { type: 'STRING' },
          category: { type: 'STRING' },
          severity: { type: 'STRING', enum: ['CRITICAL', 'MAJOR', 'MINOR', 'INFO'] },
          status: { type: 'STRING', enum: ['MATCH', 'MISMATCH', 'UNREADABLE', 'NOT_PRESENT'] },
          expected: { type: 'STRING' },
          found: { type: 'STRING' },
          message: { type: 'STRING' },
        },
      },
    },
    analysis: {
      type: 'OBJECT',
      required: ['human_match', 'dog_match', 'date_validation', 'spelling_and_grammar_notes'],
      properties: {
        human_match: { type: 'STRING' },
        dog_match: { type: 'STRING' },
        date_validation: { type: 'STRING' },
        phone_validation: { type: 'STRING' },
        spelling_and_grammar_notes: { type: 'STRING' },
        extracted_evidence: { type: 'ARRAY', items: { type: 'STRING' } },
      },
    },
  },
});

function normalizeAuditResult(data) {
  const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
  if (!text) throw new Error('Gemini no devolvió contenido analizable para este documento.');

  let result;
  try {
    result = JSON.parse(text.replace(/^```json\s*|```$/g, '').trim());
  } catch {
    throw new Error('Gemini devolvió una respuesta que no cumple el contrato JSON de auditoría.');
  }

  if (!result.analysis || typeof result.final_verdict !== 'string') {
    throw new Error('La respuesta de Gemini está incompleta.');
  }

  return {
    ...result,
    is_valid: Boolean(result.is_valid),
    score: Math.max(0, Math.min(100, Number(result.score) || 0)),
    findings: Array.isArray(result.findings) ? result.findings : [],
    analysis: {
      human_match: result.analysis.human_match || 'No evaluado.',
      dog_match: result.analysis.dog_match || 'No evaluado.',
      date_validation: result.analysis.date_validation || 'No evaluado.',
      spelling_and_grammar_notes: result.analysis.spelling_and_grammar_notes || 'Sin errores detectados.',
      ...(result.analysis.phone_validation ? { phone_validation: result.analysis.phone_validation } : {}),
      extracted_evidence: Array.isArray(result.analysis.extracted_evidence)
        ? result.analysis.extracted_evidence.filter(Boolean)
        : [],
    },
  };
}

class GeminiClient {
  constructor({ apiKey, model, timeoutMs, inlineMaxBytes, pdfMaxBytes, pdfChunkBytes, retries = 3 }) {
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.inlineMaxBytes = inlineMaxBytes;
    this.pdfMaxBytes = pdfMaxBytes;
    this.pdfChunkBytes = pdfChunkBytes;
    this.retries = retries;
  }

  get url() {
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
  }

  async audit({ prompt, buffer, mimeType, filename = 'documento' }) {
    if (!this.apiKey) throw new Error('La variable GEMINI_API_KEY no está configurada.');
    if (mimeType === 'application/pdf' && buffer.length > this.pdfMaxBytes) {
      const optimized = await optimizePdfBuffer(buffer);
      if (optimized.length <= this.pdfMaxBytes) {
        return this.audit({ prompt, buffer: optimized, mimeType, filename: `${filename} [optimizado temporalmente]` });
      }
      return this.auditPdfChunks({ prompt, buffer: optimized, filename });
    }
    if (buffer.length > this.inlineMaxBytes) {
      return this.auditViaFilesApi({ prompt, buffer, mimeType, filename });
    }
    const payload = {
      contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: buffer.toString('base64') } }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    };
    const data = await this.request(payload, this.retries);
    return normalizeAuditResult(data);
  }

  async auditPdfChunks({ prompt, buffer, filename }) {
    const chunks = await splitPdfBuffer(buffer, this.pdfChunkBytes);
    const results = [];
    for (const chunk of chunks) {
      const pageLabel = chunk.pageNumbers.join(', ');
      const chunkPrompt = `${prompt}\n\nEste fragmento contiene las páginas ${pageLabel} del documento original. `
        + 'Evalúa únicamente lo visible en estas páginas. Usa NOT_PRESENT para campos que probablemente estén en otras páginas; no los marques como discrepancia.';
      results.push(await this.audit({
        prompt: chunkPrompt,
        buffer: chunk.buffer,
        mimeType: 'application/pdf',
        filename: `${filename} [páginas ${pageLabel}]`,
      }));
    }
    return this.mergeChunkResults(results, chunks.length);
  }

  mergeChunkResults(results, chunkCount) {
    const findings = [];
    const findingKeys = new Set();
    const evidence = [];
    for (const result of results) {
      for (const item of result.findings) {
        const key = `${item.code}|${item.status}|${item.expected}|${item.found}`;
        if (!findingKeys.has(key)) {
          findingKeys.add(key);
          findings.push(item);
        }
      }
      evidence.push(...result.analysis.extracted_evidence);
    }
    return {
      is_valid: results.every(result => result.is_valid),
      score: Math.min(...results.map(result => result.score)),
      final_verdict: `Documento analizado completamente en ${chunkCount} fragmento(s). ${results.map(result => result.final_verdict).join(' ')}`,
      findings,
      analysis: {
        human_match: results.map(result => result.analysis.human_match).join(' | '),
        dog_match: results.map(result => result.analysis.dog_match).join(' | '),
        date_validation: results.map(result => result.analysis.date_validation).join(' | '),
        spelling_and_grammar_notes: results.map(result => result.analysis.spelling_and_grammar_notes).join(' | '),
        extracted_evidence: [...new Set(evidence)],
      },
    };
  }

  async auditViaFilesApi({ prompt, buffer, mimeType, filename }) {
    const uploadedFile = await this.uploadFile({ buffer, mimeType, filename });
    try {
      await this.waitUntilActive(uploadedFile.name);
      const payload = {
        contents: [{
          parts: [
            { text: prompt },
            { fileData: { mimeType, fileUri: uploadedFile.uri } },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      };
      const data = await this.request(payload, this.retries);
      return normalizeAuditResult(data);
    } finally {
      await this.deleteFile(uploadedFile.name).catch(error => {
        console.warn(`No se pudo eliminar el archivo temporal ${uploadedFile.name}: ${error.message}`);
      });
    }
  }

  async uploadFile({ buffer, mimeType, filename }) {
    const startResponse = await axios.post(
      'https://generativelanguage.googleapis.com/upload/v1beta/files',
      { file: { display_name: String(filename).slice(0, 512) } },
      {
        headers: {
          'x-goog-api-key': this.apiKey,
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': buffer.length,
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json',
        },
        timeout: this.timeoutMs,
      },
    );
    const uploadUrl = startResponse.headers['x-goog-upload-url'];
    if (!uploadUrl) throw new Error('Gemini no devolvió una URL para cargar el documento grande.');

    const uploadResponse = await axios.post(uploadUrl, buffer, {
      headers: {
        'Content-Length': buffer.length,
        'Content-Type': mimeType,
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      timeout: this.timeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    const file = uploadResponse.data?.file;
    if (!file?.name || !file?.uri) throw new Error('Gemini no confirmó la carga del documento grande.');
    return file;
  }

  async waitUntilActive(fileName) {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/${fileName}`, {
        headers: { 'x-goog-api-key': this.apiKey },
        timeout: 15_000,
      });
      const state = response.data?.state;
      if (state === 'ACTIVE' || !state) return;
      if (state === 'FAILED') throw new Error('Gemini no pudo procesar el archivo temporal.');
      await new Promise(resolve => setTimeout(resolve, 2_000));
    }
    throw new Error('Gemini tardó demasiado en preparar el archivo temporal.');
  }

  async deleteFile(fileName) {
    await axios.delete(`https://generativelanguage.googleapis.com/v1beta/${fileName}`, {
      headers: { 'x-goog-api-key': this.apiKey },
      timeout: 15_000,
    });
  }

  async healthCheck() {
    if (!this.apiKey) throw new Error('La variable GEMINI_API_KEY no está configurada.');
    const response = await axios.post(
      this.url,
      { contents: [{ parts: [{ text: 'Responde solamente: OK' }] }] },
      { headers: { 'x-goog-api-key': this.apiKey }, timeout: 15_000 },
    );
    return response.status;
  }

  async request(payload, retriesLeft) {
    try {
      const response = await axios.post(this.url, payload, {
        headers: { 'x-goog-api-key': this.apiKey },
        timeout: this.timeoutMs,
        maxBodyLength: Infinity,
      });
      return response.data;
    } catch (error) {
      if ([429, 503].includes(error.response?.status) && retriesLeft > 0) {
        const attempt = this.retries - retriesLeft + 1;
        const waitMs = Math.min(5_000 * (2 ** attempt), 30_000);
        console.warn(`Gemini no disponible. Reintento en ${waitMs / 1000}s.`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        return this.request(payload, retriesLeft - 1);
      }
      throw error;
    }
  }
}

module.exports = { GeminiClient, RESPONSE_SCHEMA, normalizeAuditResult };
