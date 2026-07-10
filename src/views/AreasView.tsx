import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB } from '../db/localDb';
import { getAreas, createArea } from '../services/api';

export function AreasView() {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  
  // 1. Magia Reactiva: Leemos la BD local en tiempo real
  const areas = useLiveQuery(() => localDB.areas.toArray(), []) || [];

  // 2. Fetch en 2do plano: Trae datos frescos del servidor al entrar a la vista
  useEffect(() => {
    getAreas().catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre) return;

    // 3. Guardamos usando tu función API (que maneja el Local-First)
    await createArea({ nombre, descripcion });
    
    // Limpiamos el formulario (la lista se actualizará sola gracias a useLiveQuery)
    setNombre('');
    setDescripcion('');
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'left' }}>
      <h1>Gestión de Áreas</h1>
      
      {/* Formulario de Creación */}
      <form onSubmit={handleSubmit} style={{ 
        display: 'flex', flexDirection: 'column', gap: '12px', 
        padding: '20px', background: 'var(--social-bg)', borderRadius: '8px', marginBottom: '32px'
      }}>
        <input 
          type="text" 
          placeholder="Nombre del área..." 
          value={nombre} 
          onChange={(e) => setNombre(e.target.value)}
          style={{ padding: '10px', borderRadius: '4px', border: '1px solid var(--border)' }}
        />
        <input 
          type="text" 
          placeholder="Descripción..." 
          value={descripcion} 
          onChange={(e) => setDescripcion(e.target.value)}
          style={{ padding: '10px', borderRadius: '4px', border: '1px solid var(--border)' }}
        />
        <button type="submit" style={{ 
          padding: '10px', background: 'var(--accent)', color: 'white', 
          border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
        }}>
          Crear Área
        </button>
      </form>

      {/* Lista Reactiva */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {areas.length === 0 && <p>No hay áreas creadas.</p>}
        {areas.map((area) => (
          <div key={area.id} style={{ 
            padding: '16px', border: '1px solid var(--border)', borderRadius: '8px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <h3 style={{ margin: '0 0 8px 0' }}>{area.nombre}</h3>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text)' }}>{area.descripcion}</p>
            </div>
            {/* Indicador visual de estado de sincronización */}
            <span style={{ fontSize: '20px' }} title={area._sincronizado === 1 ? 'Sincronizado' : 'Pendiente'}>
              {area._sincronizado === 1 ? '☁️' : '⏳'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}