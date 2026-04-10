const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const PORT = 3001;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;


const jwt = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.replace(/"/g, '').trim(),
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/"/g, '').replace(/\\n/g, '\n').replace(/\\r/g, ''),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, jwt);


async function callGeminiDirect(prompt, buffer, mimeType, retries = 3) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
  
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
      // Esperamos 12 segundos para respetar el límite estricto de 5 RPM si existe
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
      phone_number: row.get('phone_number'),
      client_email: row.get('client_email'),
      client_name: row.get('client_name'),
      client_id: row.get('client_id'),
      address: row.get('address'),
      travel_date: row.get('travel_date'),
      client_gender: row.get('client_gender'),
      dog_gender: row.get('dog_gender'),
      dog_name: row.get('dog_name'),
      dog_age: row.get('dog_age'),
      dog_breed: row.get('dog_breed'),
      dog_weight: row.get('dog_weight'),
      certificate_validity: row.get('certificate_validity'),
      microchip_number: row.get('microchip_number'),
      pdf_keyword: row.get('pdf_keyword') || '',
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/validate', upload.single('file'), async (req, res) => {
  try {
    const { expectedData } = req.body;
    const client = JSON.parse(expectedData);
    const mimeType = req.file.mimetype; 
    
    const prompt = `
      Eres un auditor legal multilingüe experto (Inglés/Español) para 'Petfly'. 
      Tu objetivo es auditar la veracidad de este DOCUMENTO o CARNET (PDF o Imagen).
      
      DATOS ESPERADOS DEL SISTEMA PETFLY:
      - HUMANO: Nombre: "${client.client_name}", ID/DNI/Pasaporte: "${client.client_id}", Teléfono: "${client.phone_number}", Email: "${client.client_email}", Dirección: "${client.address}", Género del Humano: "${client.client_gender}"
      - MASCOTA: Nombre: "${client.dog_name}", Edad: "${client.dog_age}", Raza: "${client.dog_breed}", Peso: "${client.dog_weight}", Género de la Mascota: "${client.dog_gender}", Número de Microchip: "${client.microchip_number}"
      - REQUISITOS: Fecha de Viaje: "${client.travel_date}", Vigencia Certificado: "${client.certificate_validity}"

      FILOSOFÍA DE AUDITORÍA (LECTURA CRÍTICA):
      1. PRECISIÓN DE CARACTERES: Errores tipográficos como duplicación de símbolos (ej. "++" en lugar de "+") en teléfonos o IDs deben ser reportados y penalizados en el score.
      2. VERIFICACIÓN DE QR: Localiza y DECODIFICA visualmente el código QR. 
         - ¿La URL o texto dentro del QR coincide con los datos de "${client.dog_name}" o el ID de registro "${client.client_id}"? 
         - Si el QR redirige a una página de inicio genérica (home) que no muestra datos específicos de la mascota, o si el link no carga información del registro, márcalo como "is_valid_url: false". No es necesario que sea un link de Petfly, pero debe ser el perfil oficial de la mascota.
      3. CONSISTENCIA DE GÉNERO (CRÍTICO): Verifica si el texto del documento usa pronombres o adjetivos que contradigan el género esperado:
         - Si la mascota es "${client.dog_gender}" (Hembra/Female), el uso de "EL", "Macho", "Him/He" o adjetivos masculinos es una DISCREPANCIA GRAVE.
         - Si el humano es "${client.client_gender}", verifica que los pronombres coincidan.
      4. SOSPECHA DE FRAUDE: Si detectas inconsistencias visuales (fuentes diferentes, alineación pobre, o datos que no parecen reales como el "++"), sé severo con el 'is_valid'.
      5. DATOS AUSENTES: Si un dato NO aparece impreso, repórtalo como "no presente" pero no penalices agresivamente a menos que sea un dato crítico.

      REGLAS DE FORMATO Y RESPUESTA (DEBES RESPONDER ÚNICAMENTE EN JSON VÁLIDO SIN COMENTARIOS):
      {
        "is_valid": boolean,
        "score": number, // Penaliza errores tipográficos (++) y discordancias de género grave.
        "final_verdict": "string // Resumen profesional en español.",
        "qr_code_info": {
          "found": boolean,
          "content": "string o null", 
          "is_valid_url": boolean, 
          "matches_data": boolean, 
          "qr_analysis_details": "string"
        },
        "analysis": {
          "human_match": "string",
          "dog_match": "string",
          "phone_validation": "string", 
          "spelling_and_grammar_notes": "string" // Reporta aquí las discordancias de género (ej. uso de "EL" para una hembra).
        }
      }
    `;
    
    const data = await callGeminiDirect(prompt, req.file.buffer, mimeType);
    const text = data.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
    const result = JSON.parse(text);

   
    if (result.qr_code_info?.content && result.qr_code_info.content.startsWith('http')) {
      try {
        console.log(`🔍 Verificando link de QR en vivo: ${result.qr_code_info.content}`);
        const qrResponse = await axios.get(result.qr_code_info.content, { 
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PetflyAuditor/1.0' }
        });
        
        
        const pageContent = qrResponse.data.toString().toLowerCase();
        const dogName = client.dog_name.toLowerCase();
        
        if (!pageContent.includes(dogName)) {
           result.qr_code_info.matches_data = false;
           result.qr_code_info.qr_analysis_details += " ADVERTENCIA: El link funciona pero NO se encontró mención de la mascota en el contenido de la página.";
           result.score = Math.max(0, result.score - 20);
        } else {
           result.qr_code_info.matches_data = true;
           result.qr_code_info.qr_analysis_details += " ✅ Verificación EXITOSA: El link es real y contiene mención de la mascota.";
        }
      } catch (error) {
        console.error(`❌ El link del QR falló: ${error.message}`);
        result.qr_code_info.is_valid_url = false;
        result.qr_code_info.matches_data = false;
        
        const status = error.response?.status;
        if (status === 404) {
          result.qr_code_info.qr_analysis_details = "FRAUDE DETECTADO: El código QR apunta a una página inexistente (Error 404). El carnet es FALSO.";
        } else {
          result.qr_code_info.qr_analysis_details = `ERROR DE VALIDACIÓN: No se pudo acceder al link del QR (${status || 'Error de conexión'}).`;
        }
        
        result.is_valid = false;
        result.score = Math.min(result.score, 30);
        result.final_verdict = `DOCUMENTO INVALIDADO: El código QR no es funcional (${status || 'Falla'}). ` + result.final_verdict;
      }
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.response?.data?.error?.message || error.message });
  }
});

app.get('/api/test', async (req, res) => {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
    await axios.post(url, { contents: [{ parts: [{ text: "Hi" }] }] });
    res.json({ message: "¡PETFLY ONLINE!", response: "Conectado" });
  } catch (error) {
    res.status(500).json({ error: "Error de conexión." });
  }
});

app.listen(PORT, () => console.log(`🚀 Comparador Petfly en puerto ${PORT}`));
