import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, type FoodLog } from '../db/localDb';
import { createFormulario, updateFormulario, getFormularios, getMacros, getDayliTracks, getFoodLogs, createFoodLog, updateDayliTrack, createDayliTrack, deleteFoodLog } from '../services/api';
import { Apple, Droplets, Target, Activity, Send, Trash2, X, Edit2 } from 'lucide-react';
import './EvaluacionView.css';
import './FoodTrackerView.css';

export function FoodTrackerView() {
  const [showFormModal, setShowFormModal] = useState(false);
  const [foodText, setFoodText] = useState('');
  const [typeMeal, setTypeMeal] = useState('lunch');
  const [loadingAI, setLoadingAI] = useState(false);

  // DB Queries
  const activeForm = useLiveQuery(() => localDB.formularios.filter(f => f.active === 1).first(), []);
  const activeMacro = useLiveQuery(() => activeForm ? localDB.macros.filter(m => m.idFormulario === activeForm.idFormulario).first() : undefined, [activeForm]);
  
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const today = new Date(now.getTime() - offset).toISOString().slice(0,10);
  const dailyTrack = useLiveQuery(() => localDB.dayliTracks.filter(d => (d.dateTrack?.slice(0,10) || today) === today).first(), []);
  const foodLogs = useLiveQuery(() => dailyTrack ? localDB.foodLogs.filter(f => f.idDayliTrack === dailyTrack.idDayliTrack).toArray() : [], [dailyTrack]);

  // Form State
  const initialFormState = {
    gender: 'M',
    edad: 25,
    peso: 70,
    altura: 170,
    nivelActividad: 2,
    cuello: 40,
    cintura: 80,
    cadera: 90,
    meta: 'mantener',
    velocidadKgSemana: 0.5
  };
  const [formValues, setFormValues] = useState(initialFormState);

  const [formMode, setFormMode] = useState<'edit' | 'new'>('edit');

  useEffect(() => {
    if (navigator.onLine) {
      Promise.all([
        getFormularios(),
        getMacros(),
        getDayliTracks(),
        getFoodLogs()
      ]).catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (activeForm) {
      setFormValues({
        gender: activeForm.gender || 'M',
        edad: activeForm.edad || 25,
        peso: activeForm.peso || 70,
        altura: activeForm.altura || 170,
        nivelActividad: activeForm.nivelActividad || 2,
        cuello: activeForm.cuello || 40,
        cintura: activeForm.cintura || 80,
        cadera: activeForm.cadera || 90,
        meta: activeForm.meta || 'mantener',
        velocidadKgSemana: activeForm.velocidadKgSemana || 0.5
      });
    }
  }, [activeForm, showFormModal]);

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formMode === 'edit' && activeForm) {
      await updateFormulario(activeForm.idFormulario, {
        ...formValues,
        active: true,
        fechaRegistro: today
      });
    } else {
      await createFormulario({
        ...formValues,
        active: true,
        fechaRegistro: today
      });
    }
    setShowFormModal(false);
    if (navigator.onLine) {
      await getFormularios();
      await getMacros();
    }
  };

  const handleAddFood = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodText.trim()) return;
    setLoadingAI(true);
    try {
      await createFoodLog({
        idDayliTrack: dailyTrack?.idDayliTrack || "",
        typeMeal: typeMeal,
        food: foodText,
      });
      setFoodText('');
      if (navigator.onLine) {
        await getDayliTracks();
        await getFoodLogs();
      }
    } catch (err) {
      console.error(err);
      alert("Error al guardar comida. Verifica la API Key y tu conexión.");
    } finally {
      setLoadingAI(false);
    }
  };

  // ── Corrección de cálculo de agua (Normalizado a ML) ──
  const targetWaterMl = activeMacro?.water
    ? (activeMacro.water < 20 ? Math.round(activeMacro.water * 1000) : activeMacro.water)
    : 2500;
  
  const currentWaterMl = dailyTrack?.water
    ? (dailyTrack.water < 20 ? Math.round(dailyTrack.water * 1000) : dailyTrack.water)
    : 0;

  const targetWaterL = (targetWaterMl / 1000).toFixed(1);
  const currentWaterL = (currentWaterMl / 1000).toFixed(2);
  const waterPercent = Math.min(100, Math.round((currentWaterMl / targetWaterMl) * 100)) || 0;

  const handleAddWater = async (deltaMl: number) => {
    const newWater = Math.max(0, currentWaterMl + deltaMl);
    if (!dailyTrack) {
      if (!activeMacro) {
        alert("Debes establecer tu meta primero para poder registrar agua.");
        return;
      }
      await createDayliTrack({
        idMacro: activeMacro.idMacro,
        water: newWater,
        dateTrack: today,
        caloriesCount: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0
      });
    } else {
      await updateDayliTrack(dailyTrack.idDayliTrack, {
        ...dailyTrack,
        water: newWater
      });
    }
    if (navigator.onLine) {
      await getDayliTracks();
      await getFoodLogs();
    }
  };

  const handleDeleteFood = async (fl: FoodLog) => {
    if (confirm(`¿Eliminar "${fl.food}"?`)) {
      await deleteFoodLog(fl.idFoodLog);
      if (navigator.onLine) {
        await getDayliTracks();
        await getFoodLogs();
      }
    }
  };

  // Progress calculations
  const targetCals = activeMacro?.Calories || 2000;
  const currentCals = dailyTrack?.caloriesCount || 0;
  const targetProt = activeMacro?.protein || 150;
  const currentProt = dailyTrack?.protein || 0;
  const targetCarbs = activeMacro?.carbs || 250;
  const currentCarbs = dailyTrack?.carbs || 0;
  const targetFat = activeMacro?.fat || 70;
  const currentFat = dailyTrack?.fat || 0;

  const getPercent = (c: number, t: number) => Math.min(100, Math.round((c / t) * 100)) || 0;

  return (
    <div className="food-tracker-container">
      <div className="food-tracker-header">
        <div>
          <h1 style={{ margin: '0 0 6px 0', fontSize: '26px', color: 'var(--text-main)' }}>Food Tracker</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Control de dieta y macros potenciado por IA.</p>
        </div>
        <div className="food-header-buttons">
          {activeForm && (
            <button className="btn-secondary" onClick={() => { setFormMode('edit'); setShowFormModal(true); }}>
              <Edit2 size={16} /> Editar Perfil
            </button>
          )}
          <button className="btn-primary" onClick={() => { setFormMode('new'); setShowFormModal(true); }}>
            <Target size={16} /> Nueva Meta
          </button>
        </div>
      </div>

      <div className="food-tracker-grid">
        
        {/* PROGRESS CARDS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="glass-card" style={{ padding: '20px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
              <Activity size={18} color="var(--accent-primary)" /> Progreso Diario
            </h2>
            
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Calorías</span>
                <strong>{currentCals} / {targetCals} kcal</strong>
              </div>
              <div style={{ width: '100%', background: 'rgba(255,255,255,0.08)', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: `${getPercent(currentCals, targetCals)}%`, background: 'var(--accent-primary)', height: '100%', transition: 'width 0.3s' }} />
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Proteínas</span>
                <strong>{currentProt} / {targetProt} g</strong>
              </div>
              <div style={{ width: '100%', background: 'rgba(255,255,255,0.08)', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: `${getPercent(currentProt, targetProt)}%`, background: '#ff7b72', height: '100%', transition: 'width 0.3s' }} />
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Carbohidratos</span>
                <strong>{currentCarbs} / {targetCarbs} g</strong>
              </div>
              <div style={{ width: '100%', background: 'rgba(255,255,255,0.08)', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: `${getPercent(currentCarbs, targetCarbs)}%`, background: '#f0883e', height: '100%', transition: 'width 0.3s' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Grasas</span>
                <strong>{currentFat} / {targetFat} g</strong>
              </div>
              <div style={{ width: '100%', background: 'rgba(255,255,255,0.08)', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: `${getPercent(currentFat, targetFat)}%`, background: '#d2a8ff', height: '100%', transition: 'width 0.3s' }} />
              </div>
            </div>
          </div>

          {/* WATER TRACKER CARD */}
          <div className="glass-card" style={{ padding: '20px' }}>
            <h2 style={{ marginBottom: '14px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
              <Droplets size={18} color="#79c0ff" /> Agua ({currentWaterL} L / {targetWaterL} L)
            </h2>
            <div style={{ width: '100%', background: 'rgba(255,255,255,0.08)', height: '10px', borderRadius: '5px', overflow: 'hidden', marginBottom: '14px' }}>
              <div style={{ width: `${waterPercent}%`, background: '#79c0ff', height: '100%', transition: 'width 0.3s' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-icon" style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '13px' }} onClick={() => handleAddWater(-250)}>
                - 250 ml
              </button>
              <button className="btn-icon" style={{ flex: 1, padding: '10px', background: 'rgba(121,192,255,0.2)', color: '#79c0ff', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px' }} onClick={() => handleAddWater(250)}>
                + 250 ml
              </button>
            </div>
          </div>
        </div>

        {/* FOOD LOG INPUT & HISTORY */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="glass-card" style={{ padding: '20px' }}>
            <h2 style={{ marginBottom: '14px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
              <Apple size={18} color="#ff7b72" /> Agregar Comida (IA)
            </h2>
            
            <form onSubmit={handleAddFood} className="food-ia-form">
              <select 
                className="food-select" 
                value={typeMeal} 
                onChange={e => setTypeMeal(e.target.value)}
              >
                <option value="breakfast">🌅 Desayuno</option>
                <option value="lunch">☀️ Almuerzo</option>
                <option value="dinner">🌙 Cena</option>
                <option value="snack">🍎 Snack / Merienda</option>
              </select>

              <textarea 
                className="food-textarea" 
                rows={3}
                placeholder="Describe tu comida detallando porciones. Ej: 2 huevos revueltos con un pan integral y un vaso de jugo de naranja..."
                value={foodText}
                onChange={e => setFoodText(e.target.value)}
                disabled={loadingAI}
              />

              <button type="submit" className="btn-primary food-submit-btn" disabled={loadingAI}>
                {loadingAI ? 'Calculando con IA...' : <><Send size={18}/> Analizar y Registrar Comida</>}
              </button>
            </form>
          </div>

          <div className="glass-card" style={{ padding: '20px', flex: 1 }}>
            <h3 style={{ margin: '0 0 14px 0', fontSize: '16px', color: 'var(--text-main)' }}>Comidas Registradas Hoy</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(!foodLogs || foodLogs.length === 0) && (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
                  No hay registros de comidas para el día de hoy.
                </p>
              )}
              {foodLogs?.map(fl => (
                <div key={fl.idFoodLog} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '13px', color: 'var(--accent-primary)', textTransform: 'uppercase' }}>
                      {fl.type_meal}
                    </strong>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#ff7b72' }}>{fl.calories} kcal</span>
                  </div>
                  <p style={{ margin: '6px 0', fontSize: '14px', color: 'var(--text-main)' }}>{fl.food}</p>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span>Prot: <strong>{fl.protein}g</strong></span>
                    <span>Carbs: <strong>{fl.carbs}g</strong></span>
                    <span>Grasas: <strong>{fl.fat}g</strong></span>
                    <span>Fibra: <strong>{fl.fiber}g</strong></span>
                  </div>
                  <button 
                    className="btn-icon danger" 
                    style={{ position: 'absolute', right: '8px', bottom: '8px', padding: '6px' }}
                    onClick={() => handleDeleteFood(fl)}
                    title="Eliminar comida"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {showFormModal && (
        <div className="modal-overlay" onClick={() => setShowFormModal(false)}>
          <div className="modal-content glass-card" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{formMode === 'edit' ? 'Editar Perfil Actual' : 'Configurar Perfil & Meta (Nuevo)'}</h2>
              <button className="action-btn" onClick={() => setShowFormModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveForm} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
                <div className="form-group" style={{ flex: 1, minWidth: '140px' }}>
                  <label>Género</label>
                  <select className="glass-select" value={formValues.gender} onChange={e => setFormValues({...formValues, gender: e.target.value})}>
                    <option value="M">Hombre</option>
                    <option value="F">Mujer</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: '140px' }}>
                  <label>Edad</label>
                  <input type="number" required className="form-input" value={formValues.edad} onChange={e => setFormValues({...formValues, edad: parseInt(e.target.value) || 0})} />
                </div>
              </div>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
                <div className="form-group" style={{ flex: 1, minWidth: '140px' }}>
                  <label>Peso (kg)</label>
                  <input type="number" step="0.1" required className="form-input" value={formValues.peso} onChange={e => setFormValues({...formValues, peso: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: '140px' }}>
                  <label>Altura (cm)</label>
                  <input type="number" required className="form-input" value={formValues.altura} onChange={e => setFormValues({...formValues, altura: parseInt(e.target.value) || 0})} />
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                <div className="form-group" style={{ flex: 1, minWidth: '90px' }}>
                  <label>Cuello (cm)</label>
                  <input type="number" step="0.1" className="form-input" value={formValues.cuello} onChange={e => setFormValues({...formValues, cuello: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: '90px' }}>
                  <label>Cintura (cm)</label>
                  <input type="number" step="0.1" className="form-input" value={formValues.cintura} onChange={e => setFormValues({...formValues, cintura: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: '90px' }}>
                  <label>Cadera (cm)</label>
                  <input type="number" step="0.1" className="form-input" value={formValues.cadera} onChange={e => setFormValues({...formValues, cadera: parseFloat(e.target.value) || 0})} />
                </div>
              </div>

              <div className="form-group">
                <label>Nivel de Actividad</label>
                <select className="glass-select" value={formValues.nivelActividad} onChange={e => setFormValues({...formValues, nivelActividad: parseInt(e.target.value)})}>
                  <option value={1}>1 - Sedentario</option>
                  <option value={2}>2 - Ligero (1-3 días/sem)</option>
                  <option value={3}>3 - Moderado (3-5 días/sem)</option>
                  <option value={4}>4 - Intenso (6-7 días/sem)</option>
                  <option value={5}>5 - Muy Intenso / Atleta</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
                <div className="form-group" style={{ flex: 1, minWidth: '140px' }}>
                  <label>Meta</label>
                  <select className="glass-select" value={formValues.meta} onChange={e => setFormValues({...formValues, meta: e.target.value})}>
                    <option value="bajar">Bajar de Peso</option>
                    <option value="mantener">Mantener</option>
                    <option value="subir">Subir de Peso</option>
                  </select>
                </div>
                {formValues.meta !== 'mantener' && (
                  <div className="form-group" style={{ flex: 1, minWidth: '140px' }}>
                    <label>Velocidad (kg/sem)</label>
                    <input type="number" step="0.1" className="form-input" value={formValues.velocidadKgSemana} onChange={e => setFormValues({...formValues, velocidadKgSemana: parseFloat(e.target.value) || 0})} />
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="action-btn" onClick={() => setShowFormModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar y Calcular Macros</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
