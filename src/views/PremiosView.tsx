import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, type Reward } from '../db/localDb';
import { getRewards, createReward, updateReward } from '../services/api';
import { Gift, Plus, Edit2, Trash2, X } from 'lucide-react';
import './EvaluacionView.css'; // Reusing global styles for simplicity

export function PremiosView() {
  const rewards = useLiveQuery(() => localDB.rewards.filter(r => r.estado === 1).toArray(), []) || [];
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const initialForm = { reward: '', points_need: 0, description: '' };
  const [formValues, setFormValues] = useState(initialForm);

  useEffect(() => {
    if (navigator.onLine) {
      getRewards().catch(console.error);
    }
  }, []);

  const openModal = (r?: Reward) => {
    if (r) {
      setSelectedReward(r);
      setFormValues({
        reward: r.reward,
        points_need: r.points_need,
        description: r.description || ''
      });
    } else {
      setSelectedReward(null);
      setFormValues(initialForm);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      reward: formValues.reward,
      points_need: Number(formValues.points_need),
      description: formValues.description
    };

    if (selectedReward?.id) {
      await updateReward(selectedReward.id, payload);
    } else {
      await createReward(payload);
    }
    setIsModalOpen(false);
  };

  const handleDelete = async (r: Reward) => {
    if (confirm(`¿Eliminar el premio "${r.reward}"?`)) {
      await updateReward(r.id!, { ...r, estado: 0 } as any);
    }
  };

  return (
    <div className="evaluacion-container" style={{ padding: '24px' }}>
      <div className="evaluacion-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Premios</h1>
          <p>Gestiona los premios canjeables con tus puntos.</p>
        </div>
        <button className="btn-primary" onClick={() => openModal()}>
          <Plus size={18} /> Nuevo Premio
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '20px',
        marginTop: '24px'
      }}>
        {rewards.length === 0 && (
          <p className="text-muted" style={{ gridColumn: '1 / -1' }}>No hay premios configurados aún.</p>
        )}
        
        {rewards.map(r => (
          <div key={r.id} className="glass-card" style={{ padding: '20px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Gift size={20} style={{ color: 'var(--accent)' }} />
                <h3 style={{ margin: 0 }}>{r.reward}</h3>
              </div>
              <span className="badge" style={{ background: 'var(--primary)', color: 'white', padding: '4px 8px', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold' }}>
                {r.points_need} pts
              </span>
            </div>
            
            <p className="text-muted" style={{ fontSize: '14px', marginBottom: '20px', minHeight: '40px' }}>
              {r.description || 'Sin descripción.'}
            </p>
            
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn-icon" onClick={() => openModal(r)} title="Editar">
                <Edit2 size={16} />
              </button>
              <button className="btn-icon danger" onClick={() => handleDelete(r)} title="Eliminar">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass-card">
            <button className="modal-close" onClick={() => setIsModalOpen(false)}>
              <X size={20} />
            </button>
            <h2>{selectedReward ? 'Editar Premio' : 'Nuevo Premio'}</h2>
            
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
              <div className="form-group">
                <label>Nombre del Premio</label>
                <input 
                  type="text" 
                  required 
                  value={formValues.reward} 
                  onChange={e => setFormValues({...formValues, reward: e.target.value})}
                  className="input-field"
                  placeholder="Ej. Salida al cine"
                />
              </div>
              <div className="form-group">
                <label>Puntos Necesarios</label>
                <input 
                  type="number" 
                  required 
                  min="1"
                  value={formValues.points_need} 
                  onChange={e => setFormValues({...formValues, points_need: parseInt(e.target.value) || 0})}
                  className="input-field"
                />
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <textarea 
                  rows={3}
                  value={formValues.description} 
                  onChange={e => setFormValues({...formValues, description: e.target.value})}
                  className="input-field"
                  placeholder="Detalles del premio..."
                />
              </div>
              <button type="submit" className="btn-primary" style={{ marginTop: '8px' }}>
                Guardar Premio
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
