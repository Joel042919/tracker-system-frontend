import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, type Reward } from '../db/localDb';
import { getRewards, createReward, updateReward, createPuntosUsados } from '../services/api';
import { Gift, Plus, Edit2, Trash2, X, CheckCircle, Award, Loader2 } from 'lucide-react';
import './PremiosView.css';

export function PremiosView() {
  const rewards = useLiveQuery(() => localDB.rewards.filter(r => r.estado === 1).toArray(), []) || [];
  const totalPoints = useLiveQuery(async () => {
    const pr = await localDB.point_review.get(1);
    return pr ? pr.total_puntos : 0;
  }, []) || 0;
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reclaimReward, setReclaimReward] = useState<Reward | null>(null);
  const [isReclaiming, setIsReclaiming] = useState(false);
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

  const handleReclaimClick = (r: Reward) => {
    if (totalPoints < r.points_need) {
      alert('No tienes suficientes puntos para reclamar este premio.');
      return;
    }
    setReclaimReward(r);
  };

  const confirmReclaim = async () => {
    if (isReclaiming || !reclaimReward || !reclaimReward.id) return;

    // Validación de seguridad previa
    const pr = await localDB.point_review.get(1);
    const availablePoints = pr ? pr.total_puntos : totalPoints;
    if (availablePoints < reclaimReward.points_need) {
      alert('No tienes suficientes puntos disponibles para realizar este canje.');
      setReclaimReward(null);
      return;
    }

    setIsReclaiming(true);
    try {
      await createPuntosUsados({
        id_reward: reclaimReward.id,
        reclaim_date: new Date().toISOString()
      });
      // Restar los puntos localmente para reflejo instantáneo en UI
      if (pr) {
        await localDB.point_review.put({ 
          ...pr, 
          total_puntos: Math.max(0, pr.total_puntos - reclaimReward.points_need) 
        });
      }
      setReclaimReward(null);
    } catch (e: any) {
      console.error('Error al reclamar premio', e);
      alert(e?.message || 'Hubo un error al reclamar el premio.');
    } finally {
      setIsReclaiming(false);
    }
  };

  return (
    <div className="premios-container">
      <div className="premios-header">
        <div className="premios-header-title">
          <h1>
            <Award size={28} style={{ color: 'var(--accent-primary)' }} /> Premios
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Gestiona y canjea los premios con tus puntos acumulados.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div className="premios-points-badge">
            <Award size={16} /> {totalPoints} pts disponibles
          </div>
          <button className="btn-primary" onClick={() => openModal()}>
            <Plus size={18} /> Nuevo Premio
          </button>
        </div>
      </div>

      <div className="premios-grid">
        {rewards.length === 0 && (
          <p className="text-muted" style={{ gridColumn: '1 / -1', padding: '20px 0' }}>No hay premios configurados aún.</p>
        )}
        
        {rewards.map(r => {
          const canReclaim = totalPoints >= r.points_need;
          return (
            <div key={r.id} className="glass-card premio-card">
              <div className="premio-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Gift size={20} style={{ color: 'var(--accent-primary)' }} />
                  <h3 className="premio-card-title">{r.reward}</h3>
                </div>
                <span className="premio-cost-badge">
                  {r.points_need} pts
                </span>
              </div>
              
              <p className="premio-card-desc">
                {r.description || 'Sin descripción adicional.'}
              </p>
              
              <div className="premio-card-actions">
                <button 
                  className="btn-reclamar" 
                  disabled={!canReclaim}
                  onClick={() => handleReclaimClick(r)}
                  title={canReclaim ? 'Reclamar Premio' : 'Puntos insuficientes'}
                >
                  <Gift size={15} /> Reclamar
                </button>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="btn-icon" onClick={() => openModal(r)} title="Editar">
                    <Edit2 size={16} />
                  </button>
                  <button className="btn-icon danger" onClick={() => handleDelete(r)} title="Eliminar">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {reclaimReward && (
        <div className="modal-overlay">
          <div className="modal-content glass-card" style={{ maxWidth: '400px', textAlign: 'center', pointerEvents: isReclaiming ? 'none' : 'auto' }}>
            <h2 style={{ marginBottom: '16px', color: 'var(--text-main)' }}>Confirmar Reclamo</h2>
            <div style={{ margin: '24px 0' }}>
              <Gift size={48} style={{ color: 'var(--accent-primary)', margin: '0 auto 16px auto' }} />
              <p style={{ fontSize: '16px', color: 'var(--text-main)', marginBottom: '8px' }}>
                ¿Quieres reclamar este premio?
              </p>
              <h3 style={{ fontSize: '20px', color: 'var(--accent-primary)', marginBottom: '16px' }}>
                "{reclaimReward.reward}"
              </h3>
              <p style={{ color: 'var(--text-muted)' }}>
                Se restarán <strong>{reclaimReward.points_need} puntos</strong> de tu total disponible. Esta acción no se puede deshacer.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button 
                className="btn-icon" 
                style={{ padding: '10px 24px', opacity: isReclaiming ? 0.5 : 1 }} 
                disabled={isReclaiming}
                onClick={() => setReclaimReward(null)}
              >
                Cancelar
              </button>
              <button 
                className="btn-primary" 
                style={{ padding: '10px 24px', opacity: isReclaiming ? 0.75 : 1 }} 
                disabled={isReclaiming}
                onClick={confirmReclaim}
              >
                {isReclaiming ? (
                  <>
                    <Loader2 size={18} className="animate-spin" style={{ marginRight: '8px' }} />
                    Canjeando...
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} style={{ marginRight: '8px' }} />
                    Confirmar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  className="form-input"
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
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <textarea 
                  rows={3}
                  value={formValues.description} 
                  onChange={e => setFormValues({...formValues, description: e.target.value})}
                  className="form-textarea"
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
