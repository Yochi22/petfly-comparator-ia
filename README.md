# Auditor documental Petfly

Aplicación para comparar documentos PDF/PNG/JPG con los datos oficiales de clientes almacenados en Google Sheets. El backend envía cada documento a Gemini, aplica las reglas del tipo documental y devuelve un resultado estructurado al frontend.

## Flujo operativo

1. El frontend carga los clientes desde Google Sheets a través del backend.
2. El operador selecciona obligatoriamente un cliente.
3. El operador selecciona un lote de hasta 10 documentos.
4. El navegador procesa hasta 3 documentos simultáneamente y muestra progreso por lote.
5. El backend valida el contenido real, vuelve a obtener el cliente oficial y limita la concurrencia global.
6. Gemini devuelve JSON estructurado con veredicto, score, comparaciones y evidencia extraída.
7. Una política determinista versionada recalcula la validez y el score desde los hallazgos estructurados.

Los documentos se seleccionan juntos, pero se envían individualmente. Esto evita mantener los 10 PDF y sus copias base64 simultáneamente en la memoria del servidor. Un error afecta solamente al documento correspondiente.

## Desarrollo

Frontend:

```bash
npm install
npm run dev
```

Backend:

```bash
cd backend
npm install
copy .env.example .env
node server.js
```

La URL del backend se configura en el frontend mediante `VITE_API_URL`. Si no se define se usa `http://localhost:3001`.

## Configuración operativa

Consultar [backend/.env.example](backend/.env.example). Los valores principales son:

- `MAX_FILE_MB`: máximo operativo por documento; 150 MB por defecto.
- `GEMINI_INLINE_MAX_MB`: por encima de este tamaño se usa Files API; 20 MB por defecto.
- `GEMINI_PDF_MAX_MB`: máximo que se envía como un único PDF a Gemini; 50 MB por defecto.
- `GEMINI_PDF_CHUNK_MB`: tamaño objetivo para fragmentos temporales de PDF; 40 MB por defecto.
- `MAX_CONCURRENT_AUDITS`: auditorías simultáneas en el backend; 3 por defecto.
- `AUDIT_QUEUE_TIMEOUT_MS`: espera máxima de una auditoría en cola.
- `GEMINI_TIMEOUT_MS`: timeout por petición a Gemini.
- `CLIENT_CACHE_TTL_MS`: duración del caché de Google Sheets para evitar una lectura por documento.
- `CORS_ORIGINS`: orígenes autorizados, separados por comas. Debe configurarse en producción.

No existe un límite funcional de páginas impuesto por esta aplicación. El proveedor de IA conserva sus propios límites técnicos.
Los documentos grandes se cargan temporalmente mediante Gemini Files API y se eliminan al terminar la auditoría.
Los PDF que exceden el máximo admitido se dividen temporalmente por páginas. Los resultados se fusionan antes de aplicar la política de puntuación y el documento original nunca se modifica.

## Verificación

```bash
npm run lint
npm run build
cd backend
npm test
```

## Reglas documentales

La clasificación normaliza mayúsculas, acentos, guiones y espacios. Actualmente contempla `VERI_MEDIC`, `CARNET`, `CARNET_ADI`, `REVISION`, `INFORME_ENTRENAMIENTO`, `ADI`, `K9`, `CERTIFICACION_ADI` y `MEDICAL_HISTORY_TRANSLATE`.

`CERTIFICACION_ADI` acepta además variantes como “Certificado de ADI” y “Certificate ADI”. Su análisis exige evidencia concreta de campos leídos y ya no pierde todas sus reglas cuando la fecha de expedición de Sheets no puede interpretarse.

## Arquitectura del backend

- `domain/dates.js`: fechas estrictas y vigencias en años o meses.
- `domain/documentPolicies.js`: comprobaciones obligatorias por tipo documental.
- `domain/scoringPolicy.js`: puntuación determinista y versionada.
- `infrastructure/clientRepository.js`: Google Sheets y caché.
- `infrastructure/geminiClient.js`: contrato estructurado, timeout y reintentos de Gemini.
- `lib/documentTypes.js`: clasificación normalizada de documentos.

Gemini informa hallazgos estructurados, pero no tiene la decisión final exclusiva. La política `1.0.0` comienza en 100 puntos y descuenta 35 por hallazgo crítico, 15 por hallazgo mayor y 5 por hallazgo menor. Una discrepancia crítica invalida el documento. Las verificaciones obligatorias ausentes se convierten explícitamente en hallazgos `UNREADABLE`.
