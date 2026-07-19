console.log("🟢 Iniciando servidor backend...");
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3001;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;


const jwt = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.replace(/"/g, '').trim(),
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/"/g, '').replace(/\\n/g, '\n').replace(/\\r/g, ''),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, jwt);


const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];


function parseExpedition(str) {
  if (!str) return null;
  const p = str.trim().split('/');
  if (p.length !== 3) return null;
  const [d, m, y] = p.map(Number);
  return new Date(y, m - 1, d);
}


function parseYears(validity) {
  if (!validity) return null;
  const match = validity.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}


function addYears(date, n) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + n);
  return d;
}


function fmtCarnet(date) {
  return `${MONTHS_SHORT[date.getMonth()]}/${String(date.getDate()).padStart(2,'0')}/${date.getFullYear()}`;
}


function fmtSlash(date) {
  return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
}


function fmtLong(date) {
  return `${MONTHS_FULL[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}


function fmtDash(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}


function prevMonth(date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() - 1);
  return d;
}


function detectDocType(filename) {
  const lower = (filename || '').toLowerCase();
  if (/^veri\s*medic/.test(lower)) return 'VERI_MEDIC';
  if (lower.startsWith('carnet adi')) return 'CARNET_ADI';
  if (lower.startsWith('carnet'))   return 'CARNET';
  if (lower.startsWith('revision')) return 'REVISION';
  if (lower.startsWith('informe entrenamiento')) return 'INFORME_ENTRENAMIENTO';
  if (lower.startsWith('certificacion adi')) return 'CERTIFICACION_ADI';
  if (lower.startsWith('adi')) return 'ADI';
  if (lower.startsWith('k9')) return 'K9';
  if (lower.startsWith('medical history translate')) return 'MEDICAL_HISTORY_TRANSLATE';
  return 'GENERIC';
}



async function callGeminiDirect(prompt, buffer, mimeType, retries = 3) {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: mimeType, data: buffer.toString('base64') } }
      ]
    }]
  };

  try {
    const response = await axios.post(url, payload);
    return response.data;
  } catch (error) {
    if ((error.response?.status === 429 || error.response?.status === 503) && retries > 0) {
      
      console.log(`⚠️ Límite de cuota alcanzado. Reintentando en 12s... (${retries} intentos restantes)`);
      await new Promise(resolve => setTimeout(resolve, 12000));
      return callGeminiDirect(prompt, buffer, mimeType, retries - 1);
    }
    throw error;
  }
}

app.get('/api/clients', async (req, res) => {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    res.json(rows.map(row => ({
      phone_number:         row.get('phone_number'),
      client_email:         row.get('client_email'),
      client_name:          row.get('client_name'),
      client_id:            row.get('client_id'),
      address:              row.get('address'),
      travel_date:          row.get('travel_date'),
      client_gender:        row.get('client_gender'),
      dog_gender:           row.get('dog_gender'),
      dog_name:             row.get('dog_name'),
      dog_age:              row.get('dog_age'),
      dog_breed:            row.get('dog_breed'),
      dog_weight:           row.get('dog_weight'),
      certificate_validity: row.get('certificate_validity'),
      expedition:           row.get('expedition') || '',
      microchip_number:     row.get('microchip_number'),
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/validate', upload.single('file'), async (req, res) => {
  try {
    const { expectedData } = req.body;
    const client   = JSON.parse(expectedData);
    const mimeType = req.file.mimetype;
    const filename = req.file.originalname || '';
    const docType  = detectDocType(filename);

    
    const expeditionDate = parseExpedition(client.expedition);
    const validityYears  = parseYears(client.certificate_validity);
    const expiryDate     = (expeditionDate && validityYears) ? addYears(expeditionDate, validityYears) : null;

    // Debug log to verify date calculations
    console.log(`📅 Expedición raw: "${client.expedition}" → parsed: ${expeditionDate}`);
    console.log(`📅 Validez raw: "${client.certificate_validity}" → años: ${validityYears}`);
    console.log(`📅 Vencimiento calculado: ${expiryDate} → ${expiryDate ? fmtCarnet(expiryDate) : 'null'}`);

    
    let dateSection = '';

    if (docType === 'VERI_MEDIC' && expeditionDate) {
      const prev        = prevMonth(expeditionDate);
      const prevShort   = MONTHS_SHORT[prev.getMonth()];
      const currShort   = MONTHS_SHORT[expeditionDate.getMonth()];
      const prevFull    = MONTHS_FULL[prev.getMonth()];
      const currFull    = MONTHS_FULL[expeditionDate.getMonth()];
      dateSection = `
      ═══════════════════════════════════════════════
      VALIDACIÓN — DOCUMENTO TIPO VERI MEDIC
      ═══════════════════════════════════════════════
      - VERIFICACIÓN DE DATOS DEL DUEÑO: Comprobar estrictamente que el nombre y documento de identidad del paciente/dueño coincidan con el sistema.
      - REDACCIÓN Y ORTOGRAFÍA: Revisar exhaustivamente todo el texto buscando errores gramaticales, ortográficos o de redacción (sea en inglés o español).
      
      VALIDACIÓN DE FECHAS:
      La fecha de expedición registrada en el sistema es: "${client.expedition}" (${fmtCarnet(expeditionDate)})

      REGLA: La fecha que aparece en este certificado médico DEBE corresponder
      al MES ACTUAL de expedición O al MES INMEDIATAMENTE ANTERIOR.

      Meses VÁLIDOS:
        • ${prevShort} ${prev.getFullYear()}  (${prevFull} ${prev.getFullYear()})
        • ${currShort} ${expeditionDate.getFullYear()}  (${currFull} ${expeditionDate.getFullYear()})
      ═══════════════════════════════════════════════`;
    }

    if (docType === 'CARNET' && expeditionDate && expiryDate) {
      dateSection = `
      ═══════════════════════════════════════════════
      VALIDACIÓN — DOCUMENTO TIPO CARNET (MULTI-PÁGINA / BLACK WOLF)
      ═══════════════════════════════════════════════

      ⚠️ PÁGINAS: Este documento puede tener MÚLTIPLES PÁGINAS. Debes analizar y extraer
      información de TODAS las páginas, no solo la primera.

      ⚠️ IMÁGENES DECORATIVAS: El carnet puede contener imágenes o ilustraciones de fondo
      genéricas (p.ej. silueta de un perro, foto de animal de raza). Estas son elementos
      gráficos decorativos del diseño del carnet, NO son fotos reales de la mascota del cliente.
      QUEDA PROHIBIDO evaluar, comentar o penalizar basándose en estas imágenes decorativas.
      Solo evalúa los CAMPOS DE TEXTO del documento.

      VERIFICACIÓN DE DATOS DEL CARNET:
      - Nombre del dueño: "${client.client_name}"
      - Teléfono celular: "${client.phone_number}"
      - Nombre del perro: "${client.dog_name}"
      - Raza del perro: "${client.dog_breed}"

      VALIDACIÓN DE FECHAS — MUY IMPORTANTE:
      El sistema Petfly calculó estas fechas con precisión matemática. Debes respetarlas al pie de la letra.

      DATE OF ISSUE (Fecha de Expedición) ESPERADA:
        Día: ${expeditionDate.getDate()}, Mes: ${MONTHS_SHORT[expeditionDate.getMonth()]} (mes ${expeditionDate.getMonth()+1}), Año: ${expeditionDate.getFullYear()}
        Formatos equivalentes aceptados:
          • "${fmtCarnet(expeditionDate)}"
          • "${fmtSlash(expeditionDate)}"
          • "${fmtLong(expeditionDate)}"

      DUE DATE (Fecha de Vencimiento) ESPERADA  [expedición + ${validityYears} año(s) = ${client.certificate_validity}]:
        Día: ${expiryDate.getDate()}, Mes: ${MONTHS_SHORT[expiryDate.getMonth()]} (mes ${expiryDate.getMonth()+1}), AÑO OBLIGATORIO: ${expiryDate.getFullYear()}
        Formatos equivalentes aceptados:
          • "${fmtCarnet(expiryDate)}"
          • "${fmtSlash(expiryDate)}"
          • "${fmtLong(expiryDate)}"

      ⛔ CRÍTICO — REGLA DE ORO PARA DUE DATE:
        - La fecha de expedición es el año ${expeditionDate.getFullYear()}.
        - La validez es ${validityYears} año(s).
        - Por lo tanto, el DUE DATE DEBE tener el año ${expiryDate.getFullYear()} — NO ${expeditionDate.getFullYear() + 1}, NO ${expeditionDate.getFullYear() + 2}, SOLO ${expiryDate.getFullYear()}.
        - Si el documento muestra cualquier otro año en el DUE DATE → DISCREPANCIA GRAVE, penaliza el score severamente.
        - Ejemplo de error a detectar: si el doc dice "Apr/14/${expeditionDate.getFullYear() + 1}" pero lo correcto es "${fmtCarnet(expiryDate)}", eso ES una discrepancia grave.

      Si DATE OF ISSUE no coincide con la fecha de expedición esperada → DISCREPANCIA GRAVE.
      Si DUE DATE no coincide exactamente (día, mes Y AÑO) con la fecha de vencimiento calculada → DISCREPANCIA GRAVE.
      Penaliza el score de forma severa en cualquiera de los dos casos.
      Reporta en "date_validation" las fechas encontradas en el documento vs las esperadas, indicando explícitamente si el año coincide.
      ═══════════════════════════════════════════════`;
    }

    if (docType === 'CARNET_ADI' && expeditionDate && expiryDate) {
      dateSection = `
      ═══════════════════════════════════════════════
      VALIDACIÓN — DOCUMENTO TIPO CARNET ADI
      ═══════════════════════════════════════════════
      - VERIFICACIÓN DE DATOS DEL DUEÑO: Comprobar el nombre del dueño ("${client.client_name}") y su celular ("${client.phone_number}").
      - VERIFICACIÓN DE DATOS DEL PERRO: Comprobar el nombre del perro ("${client.dog_name}") y su microchip ("${client.microchip_number}").
      - VALIDACIÓN DE FECHAS:
        • FECHA DE EXPEDICIÓN: Debe coincidir exactamente con: "${fmtCarnet(expeditionDate)}" (o formatos equivalentes).
        • FECHA DE VENCIMIENTO (DUE DATE): Debe coincidir exactamente con: "${fmtCarnet(expiryDate)}" (o formatos equivalentes).
      ═══════════════════════════════════════════════`;
    }

    if (docType === 'REVISION' && expeditionDate && expiryDate) {
      dateSection = `
      ═══════════════════════════════════════════════
      VALIDACIÓN — DOCUMENTO TIPO REVISIÓN
      ═══════════════════════════════════════════════

      VALIDACIÓN DE FECHAS — MUY IMPORTANTE:
      El sistema Petfly calculó estas fechas con precisión matemática. Debes respetarlas al pie de la letra.

      CERTIFICACIÓN ESPERADA (Expedición):
        Día: ${expeditionDate.getDate()}, Mes: ${MONTHS_SHORT[expeditionDate.getMonth()]} (mes ${expeditionDate.getMonth()+1}), Año: ${expeditionDate.getFullYear()}
        Formatos equivalentes aceptados:
          • "${fmtDash(expeditionDate)}"
          • "${fmtCarnet(expeditionDate)}"
          • "${fmtSlash(expeditionDate)}"
          • "${fmtLong(expeditionDate)}"

      VENCIMIENTO ESPERADA  [expedición + ${validityYears} año(s) = ${client.certificate_validity}]:
        Día: ${expiryDate.getDate()}, Mes: ${MONTHS_SHORT[expiryDate.getMonth()]} (mes ${expiryDate.getMonth()+1}), AÑO OBLIGATORIO: ${expiryDate.getFullYear()}
        Formatos equivalentes aceptados:
          • "${fmtDash(expiryDate)}"
          • "${fmtCarnet(expiryDate)}"
          • "${fmtSlash(expiryDate)}"
          • "${fmtLong(expiryDate)}"

      ⛔ CRÍTICO — REGLA DE ORO PARA FECHAS:
        - La fecha de CERTIFICACIÓN es el año ${expeditionDate.getFullYear()}.
        - La validez es ${validityYears} año(s).
        - Por lo tanto, el VENCIMIENTO DEBE tener el año ${expiryDate.getFullYear()} — NO el mismo año de certificación (${expeditionDate.getFullYear()}).
        - Si el documento muestra el mismo año de certificación en el VENCIMIENTO, ES ERROR (Discrepancia GRAVE).
        - Ejemplo de error a detectar: Si CERTIFICACIÓN es "${fmtDash(expeditionDate)}" y VENCIMIENTO muestra el mismo año de expedición en vez de "${fmtDash(expiryDate)}", debes penalizar severamente.

      Si CERTIFICACIÓN no coincide con la fecha de expedición esperada → DISCREPANCIA GRAVE.
      Si VENCIMIENTO no coincide exactamente (día, mes Y AÑO) con la fecha calculada → DISCREPANCIA GRAVE.
      Penaliza el score de forma severa en cualquiera de los dos casos.
      Reporta en "date_validation" las fechas encontradas en el doc vs las esperadas, indicando explícitamente si existe este error.
      ═══════════════════════════════════════════════`;
    }

    if (docType === 'INFORME_ENTRENAMIENTO') {
      dateSection = `
      ═══════════════════════════════════════════════
      VALIDACIÓN — DOCUMENTO TIPO INFORME ENTRENAMIENTO
      ═══════════════════════════════════════════════
      - VERIFICACIÓN DE DATOS DEL DUEÑO: Comprobar que el nombre y documento de identidad del dueño coincidan con el sistema.
      - VERIFICACIÓN DE DATOS DEL PERRO: Comprobar que el nombre, raza, microchip, edad, etc. coincidan con el sistema.
      - CONSISTENCIA DEL NOMBRE DEL PERRO: A lo largo del cuerpo del documento se menciona el nombre del perro; verificar que sea siempre el mismo y coincida.
      - FECHAS: Verificar que NO haya errores de fechas en el documento.
      - REDACCIÓN: Revisar exhaustivamente que no existan errores de redacción ni errores gramaticales.
      ═══════════════════════════════════════════════`;
    }

    if (docType === 'ADI') {
      dateSection = `
      ═══════════════════════════════════════════════
      VALIDACIÓN — DOCUMENTO TIPO ADI
      ═══════════════════════════════════════════════
      - VERIFICACIÓN DE DATOS DEL DUEÑO: Comprobar que el nombre y documento de identidad del dueño coincidan con el sistema.
      - VERIFICACIÓN DE DATOS DEL PERRO: Comprobar que los datos generales del perro (nombre y raza) coincidan con el sistema.
      - FECHA DE EXPEDICIÓN: Verificar que la fecha de expedición en el documento sea correcta. Fecha esperada: "${expeditionDate ? fmtCarnet(expeditionDate) : 'No especificada'}" (o formatos equivalentes).
      - NOMBRE DEL PERRO EN CUERPO: En el cuerpo del documento, verificar que el nombre del perro coincida.
      - PAÍS DEL DUEÑO: Verificar que el país (Country) especificado en el documento corresponda correctamente al país del indicativo/prefijo del teléfono registrado en el sistema. (Ejemplo: si el teléfono empieza por +34, el país debe ser España; si empieza por +57, Colombia). El teléfono registrado en el sistema es: "${client.phone_number}".
      - REDACCIÓN: Revisar exhaustivamente que no existan errores de redacción ni errores gramaticales.
      ═══════════════════════════════════════════════`;
    }

    if (docType === 'K9') {
      dateSection = `
      ═══════════════════════════════════════════════
      VALIDACIÓN — DOCUMENTO TIPO K9
      ═══════════════════════════════════════════════
      - VERIFICACIÓN DE DATOS DEL DUEÑO: Comprobar que el nombre y documento de identidad del dueño coincidan con el sistema.
      - VERIFICACIÓN DE DATOS DEL PERRO: Comprobar que los datos generales del perro (nombre y raza) coincidan con el sistema.
      - REDACCIÓN: Revisar exhaustivamente que no existan errores de redacción ni errores gramaticales.
      ═══════════════════════════════════════════════`;
    }

    if (docType === 'CERTIFICACION_ADI' && expeditionDate) {
      dateSection = `
      ═══════════════════════════════════════════════
      VALIDACIÓN — DOCUMENTO TIPO CERTIFICACIÓN ADI
      ═══════════════════════════════════════════════
      - VERIFICACIÓN DE DATOS DEL DUEÑO: Comprobar que el nombre del dueño ("${client.client_name}") coincida con el sistema.
      - VERIFICACIÓN DE DATOS DEL PERRO: Comprobar el nombre ("${client.dog_name}"), la raza ("${client.dog_breed}") y el sexo del perro. Nota: Recuerda la regla del sexo de la mascota (siempre se trata en masculino en el documento, no penalizar si una hembra se refiere en masculino).
      - FECHA DE EXPEDICIÓN: Verificar que la fecha en el documento coincida con: "${fmtCarnet(expeditionDate)}" (o formatos equivalentes).
      - HORAS DE ENTRENAMIENTO: Debe certificar estrictamente que se completaron 160 horas de entrenamiento ("160 hours of training" o "160 horas de entrenamiento"). Si dice otra cantidad de horas, márcalo como discrepancia y reduce el score.
      - REDACCIÓN Y ORTOGRAFÍA: Revisar detalladamente que no existan errores de redacción ni errores gramaticales. El documento se encuentra en inglés y español simultáneamente, evalúa ambos textos.
      ═══════════════════════════════════════════════`;
    }

    if (docType === 'MEDICAL_HISTORY_TRANSLATE' && expeditionDate) {
      dateSection = `
      ═══════════════════════════════════════════════
      VALIDACIÓN — DOCUMENTO TIPO MEDICAL HISTORY TRANSLATE
      ═══════════════════════════════════════════════
      - VERIFICACIÓN DE DATOS DEL DUEÑO: Comprobar el nombre ("${client.client_name}") y la identificación ("${client.client_id}").
      - FECHA: Verificar que la fecha coincida con la registrada en el sistema: "${fmtCarnet(expeditionDate)}" (o formatos equivalentes).
      - REDACCIÓN Y ORTOGRAFÍA: Revisar exhaustivamente todo el documento en inglés para detectar errores de redacción, gramaticales y de ortografía.
      ═══════════════════════════════════════════════`;
    }


    const prompt = `
      Eres un auditor legal multilingüe experto (Inglés/Español) para 'Petfly'.
      Tu objetivo es auditar la veracidad de este DOCUMENTO o CARNET (PDF o Imagen).
      Nombre del archivo analizado: "${filename}" (Tipo detectado: ${docType})

      ════════════════════════════════════════════════════════
      REGLA ABSOLUTA — NO PENALICES FECHAS SOLO POR SER FUTURAS
      ════════════════════════════════════════════════════════
      El sistema Petfly emite certificados con fechas de expedición y vencimiento FUTURAS con total normalidad.
      QUEDA TERMINANTEMENTE PROHIBIDO:
        - Marcar un documento como inválido O reducir el score SIMPLEMENTE porque su fecha sea futura.
        - Mencionar "fecha futura" como problema, irregularidad o sospecha de fraude.
        
      ⚠️ EXCEPCIÓN CRÍTICA - APLICACIÓN ESTRICTA DE REGLAS DE FECHAS:
      Esto NO significa que ignores errores de fechas o aceptes cualquier fecha futura. DEBES aplicar estrictamente las reglas específicas que se indican más abajo en este prompt:
      - En CARNET o REVISIÓN: Las fechas deben coincidir EXACTAMENTE (día, mes y AÑO esperado). Si se espera 2029 y dice 2027 (o el mismo año de expedición erróneamente), ES DISCREPANCIA GRAVE.
      - En VERI MEDIC: El documento debe corresponder SOLO al mes actual de expedición o al anterior, tal como se definirá abajo.
      Siempre penaliza severamente los errores en las fechas si no cumplen estas reglas, sin importar si las fechas involucradas están en el futuro.
      ════════════════════════════════════════════════════════

      DATOS ESPERADOS DEL SISTEMA PETFLY:
      - HUMANO: Nombre: "${client.client_name}", ID/DNI/Pasaporte: "${client.client_id}", Teléfono: "${client.phone_number}", Dirección: "${client.address}", Género del Humano: "${client.client_gender}"
      - MASCOTA: Nombre: "${client.dog_name}", Edad: "${client.dog_age}", Raza: "${client.dog_breed}", Peso: "${client.dog_weight}", Género de la Mascota: "${client.dog_gender}", Número de Microchip: "${client.microchip_number}"
      - REQUISITOS: Fecha de Viaje: "${client.travel_date}"
      ${dateSection}

      FILOSOFÍA DE AUDITORÍA:
      1. SOLO EVALÚA LO QUE EXISTE: Compara únicamente los campos PRESENTES en el documento. Si un campo no aparece impreso, ignóralo.
      2. PRECISIÓN DE CARACTERES: Errores como "++" en teléfonos o IDs → penaliza en el score.
      3. ERRORES GRAMATICALES Y ORTOGRÁFICOS (SIEMPRE OBLIGATORIO):
         - Lee TODO el texto del documento buscando errores gramaticales, ortográficos o de redacción en cualquier idioma.
         - Ejemplos: palabras mal escritas, frases sin cohesión, puntuación incorrecta, mezcla errónea de idiomas, concordancia incorrecta.
         - SIEMPRE debes completar "spelling_and_grammar_notes". Si no hay errores escribe "Sin errores detectados". NUNCA dejes este campo vacío.
      4. IGNORAR GÉNERO DE LA MASCOTA: Aunque el sistema indique un género (ej. Hembra), los documentos siempre tratarán a la mascota en masculino. NUNCA penalices, comentes ni audites la consistencia de género de la mascota.
      5. FRAUDE VISUAL: Fuentes distintas, alineación pobre, datos que no encajan visualmente → sé severo con is_valid.

      REGLAS DE FORMATO Y RESPUESTA (JSON VÁLIDO SIN COMENTARIOS):
      {
        "is_valid": boolean,
        "score": number,
        "final_verdict": "string — resumen profesional en español basado SOLO en los campos presentes y las reglas aplicadas.",
        "analysis": {
          "human_match":                "string — campos del humano presentes y si coinciden.",
          "dog_match":                  "string — campos de la mascota presentes y si coinciden.",
          "date_validation":            "string — fechas encontradas en el doc vs fechas esperadas. Detalla el resultado.",
          "phone_validation":           "string — solo si el teléfono está presente en el documento.",
          "spelling_and_grammar_notes": "string — OBLIGATORIO: lista detallada de errores gramaticales/ortográficos, o 'Sin errores detectados'."
        }
      }
    `;

    const data = await callGeminiDirect(prompt, req.file.buffer, mimeType);
    const text = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(text);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.response?.data?.error?.message || error.message });
  }
});

app.get('/api/test', async (req, res) => {
  try {
    console.log("🔍 Probando conexión con Gemini...");
    if (!GEMINI_API_KEY) {
      throw new Error("La variable GEMINI_API_KEY no está definida en el entorno.");
    }
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await axios.post(url, { contents: [{ parts: [{ text: "Hi" }] }] });
    console.log("✅ Conexión con Gemini exitosa");
    res.json({ 
      message: "¡PETFLY ONLINE!", 
      response: "Conectado", 
      model: "gemini-flash-latest",
      status: response.status
    });
  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    console.error("❌ Error en la prueba de Gemini:", errorDetails);
    res.status(500).json({ 
      error: "Error de conexión.", 
      details: errorDetails 
    });
  }
});

app.get('/api/debug-ip', async (req, res) => {
  try {
    const response = await axios.get('https://api.ipify.org?format=json');
    res.json({
      server_ip: response.data.ip,
      note: "Si esta IP no es de EE.UU., Google bloqueará Gemini."
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Comparador Petfly en puerto ${PORT}`));
