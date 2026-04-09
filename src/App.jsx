import React, { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Search, 
  Upload as UploadIcon, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  FileText,
  User,
  RefreshCcw,
  Layers,
  Image as ImageIcon,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function App() {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [results, setResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    document.title = "Comparador Petfly";
    fetch(`${API_URL}/api/clients`)
      .then(res => res.json())
      .then(data => {
        setClients(data);
        setIsLoading(false);
      })
      .catch(err => {
        setError("No se pudo conectar con el servidor.");
        setIsLoading(false);
      });
  }, []);

  const downloadReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Reporte de Auditoría Petfly', 14, 20);
    doc.setFontSize(10);
    doc.text(`Fecha: ${new Date().toLocaleString()}`, 14, 28);

    const tableData = results.map(res => [
      res.fileName,
      res.clientName || 'N/A',
      `${res.score}%`,
      res.is_valid ? 'VÁLIDO' : 'ERROR',
      res.final_verdict || res.error || 'Sin comentarios'
    ]);

    autoTable(doc, {
      startY: 35,
      head: [['Archivo', 'Cliente', 'Score', 'Estado', 'Observaciones']],
      body: tableData,
      headStyles: { fillStyle: 'stack', fillColor: [14, 165, 233] },
    });

    doc.save(`Reporte_Petfly_${new Date().getTime()}.pdf`);
  };

  const onDrop = async (acceptedFiles) => {
    setIsProcessing(true);
    setError(null);
    const newResults = [];

    for (const file of acceptedFiles) {
      let clientToValidate = selectedClient;
      if (!clientToValidate) {
        clientToValidate = clients.find(c => 
          file.name.toLowerCase().includes(c.client_name.toLowerCase().split(' ')[0]) ||
          file.name.toLowerCase().includes(c.pdf_keyword.toLowerCase())
        );
      }

      if (!clientToValidate) {
        newResults.push({ fileName: file.name, error: "No se encontró cliente." });
        continue;
      }

      const formData = new FormData();
      formData.append('file', file); 
      formData.append('expectedData', JSON.stringify(clientToValidate));

      try {
        const res = await fetch(`${API_URL}/api/validate`, {
          method: 'POST',
          body: formData,
        });
        const result = await res.json();
        newResults.push({ ...result, fileName: file.name, clientName: clientToValidate.client_name });
      } catch (err) {
        newResults.push({ fileName: file.name, error: "Error en el servidor de IA." });
      }
    }

    setResults(prev => [...newResults, ...prev]);
    setIsProcessing(false);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg']
    },
    multiple: true
  });

  const filteredClients = clients.filter(c => 
    c.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.pdf_keyword?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="app-container">
      <header>
        <h1>Comparador Petfly</h1>
        <p className="subtitle">Auditoría de certificados y carnets (PDF, PNG, JPG)</p>
      </header>

      <main style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '2rem' }}>
        
        <section>
          <div className="glass card" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>¿Problemas con la IA?</p>
            <button 
              className="button button-outline" 
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
              onClick={async () => {
                try {
                  const res = await fetch(`${API_URL}/api/test`);
                  const result = await res.json();
                  if (result.error) alert("❌ Error en Gemini: " + result.error);
                  else alert("✅ " + result.message + ": " + result.response);
                } catch(e) { alert("❌ Error: Servidor backend apagado."); }
              }}
            >
              Test Petfly
            </button>
          </div>

          <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`} style={{ marginBottom: '2rem' }}>
            <input {...getInputProps()} />
            <div style={{ display: 'flex', gap: '1rem' }}>
              <UploadIcon size={32} color="var(--primary)" />
              <ImageIcon size={32} color="var(--accent)" />
            </div>
            <h3>{isProcessing ? 'Procesando archivos...' : 'Sube PDFs o Fotos de carnets'}</h3>
            <p className="text-dim">Soporte para English & Español. Arrastra varios archivos a la vez.</p>
          </div>

          {isProcessing && (
            <div className="glass card" style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <RefreshCcw className="animate-spin" style={{ margin: 'auto' }} />
              <p>Analizando documentos Petfly...</p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Resultados ({results.length})</h3>
            {results.length > 0 && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="button button-outline" onClick={() => setResults([])} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', borderColor: 'var(--error)', color: 'var(--error)' }}>
                  <Trash2 size={16} /> Limpiar Resultados
                </button>
                <button className="button button-accent" onClick={downloadReport} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                  <FileText size={16} /> Descargar Reporte
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <AnimatePresence>
              {results.map((res, i) => (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, x: -20 }} 
                  animate={{ opacity: 1, x: 0 }} 
                  className="glass card"
                  style={{ borderLeft: `6px solid ${res.error ? 'var(--error)' : (res.is_valid ? 'var(--accent)' : 'var(--warning)')}` }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: 0 }}>{res.fileName}</h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                        {res.clientName ? `Cliente: ${res.clientName}` : '❌ Sin coincidencia'}
                      </p>
                    </div>
                    {res.score !== undefined && <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{res.score}%</div>}
                  </div>
                  
                  {res.final_verdict && (
                    <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: res.is_valid ? 'var(--text-dim)' : 'var(--error)' }}>
                      {res.final_verdict}
                    </p>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>

        <aside>
          <div className="glass card" style={{ position: 'sticky', top: '2rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
               <Layers size={20} /> Base de Datos Petfly
            </h3>
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text" 
                className="input" 
                placeholder="Buscar cliente..." 
                style={{ paddingLeft: '35px', fontSize: '0.9rem' }}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {filteredClients.map((c, i) => (
                <div 
                  key={i} 
                  className="card" 
                  style={{ marginBottom: '8px', border: selectedClient?.client_name === c.client_name ? '1px solid var(--primary)' : '1px solid transparent', cursor: 'pointer' }}
                  onClick={() => setSelectedClient(c)}
                >
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{c.client_name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{c.pdf_keyword} • {c.dog_name}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>

      </main>
      <style>{`.animate-spin { animation: spin 2s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
