import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, type FoodLog } from '../db/localDb';
import { createFormulario, updateFormulario, getFormularios, getMacros, getDayliTracks, getFoodLogs, createFoodLog, updateDayliTrack, createDayliTrack, deleteFoodLog } from '../services/api';
import { Apple, Droplets, Target, Activity, Send, Trash2, X, Edit2 } from 'lucide-react';
import './EvaluacionView.css'; 

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
    // Como el backend auto-crea o actualiza las macros, forzamos la recarga de datos:
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
        idDayliTrack: dailyTrack?.idDayliTrack || "", // Si está vacío el backend lo creará
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

  const handleAddWater = async (ml: number) => {
    if (!dailyTrack) {
      // Creamos un DayliTrack inicial si no existe
      if (!activeMacro) {
        alert("Debes establecer tu meta primero para poder registrar agua.");
        return;
      }
      const newWater = ml < 0 ? 0 : ml;
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
      const newWater = (dailyTrack.water || 0) + ml;
      await updateDayliTrack(dailyTrack.idDayliTrack, {
        ...dailyTrack,
        water: newWater < 0 ? 0 : newWater
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
  const targetWater = activeMacro?.water || 2500;
  const currentWater = dailyTrack?.water || 0;

  const getPercent = (c: number, t: number) => Math.min(100, Math.round((c / t) * 100)) || 0;

  return (
    <div className="evaluacion-container" style={{ padding: '24px' }}>
      <div className="evaluacion-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Food Tracker</h1>
          <p>Control de dieta y macros potenciado por IA.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {activeForm && (
            <button className="btn-secondary" onClick={() => { setFormMode('edit'); setShowFormModal(true); }}>
              <Edit2 size={18} /> Editar Formulario Actual
            </button>
          )}
          <button className="btn-primary" onClick={() => { setFormMode('new'); setShowFormModal(true); }}>
            <Target size={18} /> Actualizar Mi Meta (Nuevo)
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginTop: '24px' }}>
        
        {/* PROGRESS CARDS */}
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="glass-card" style={{ padding: '24px' }}>
            <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={20} color="var(--accent)" /> Progreso Diario
            </h2>
            
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                <span>Calorías</span>
                <strong>{currentCals} / {targetCals} kcal</strong>
              </div>
              <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ width: `${getPercent(currentCals, targetCals)}%`, background: 'var(--accent-primary)', height: '100%', transition: 'width 0.3s' }} />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                <span>Proteínas</span>
                <strong>{currentProt} / {targetProt} g</strong>
              </div>
              <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ width: `${getPercent(currentProt, targetProt)}%`, background: '#ff7b72', height: '100%', transition: 'width 0.3s' }} />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                <span>Carbohidratos</span>
                <strong>{currentCarbs} / {targetCarbs} g</strong>
              </div>
              <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ width: `${getPercent(currentCarbs, targetCarbs)}%`, background: '#f0883e', height: '100%', transition: 'width 0.3s' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                <span>Grasas</span>
                <strong>{currentFat} / {targetFat} g</strong>
              </div>
              <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ width: `${getPercent(currentFat, targetFat)}%`, background: '#d2a8ff', height: '100%', transition: 'width 0.3s' }} />
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '24px' }}>
            <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Droplets size={20} color="#79c0ff" /> Agua ({currentWater/1000} / {targetWater} ml)
            </h2>
            <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', height: '12px', borderRadius: '6px', overflow: 'hidden', marginBottom: '16px' }}>
              <div style={{ width: `${getPercent(currentWater, targetWater)}%`, background: '#79c0ff', height: '100%', transition: 'width 0.3s' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-icon" style={{ flex: 1, background: 'rgba(255,255,255,0.05)' }} onClick={() => handleAddWater(-250)}>- 250ml</button>
              <button className="btn-icon" style={{ flex: 1, background: 'rgba(121,192,255,0.2)' }} onClick={() => handleAddWater(250)}>+ 250ml</button>
            </div>
          </div>
        </div>

        {/* FOOD LOG INPUT */}
        <div style={{ flex: '2 1 400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="glass-card" style={{ padding: '24px' }}>
            <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Apple size={20} color="#ff7b72" /> Agregar Comida (IA)
            </h2>
            <form onSubmit={handleAddFood} style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
              <select 
                className="input-field" 
                value={typeMeal} 
                onChange={e => setTypeMeal(e.target.value)}
                style={{ width: '150px' }}
              >
                <option value="breakfast">Desayuno</option>
                <option value="lunch">Almuerzo</option>
                <option value="dinner">Cena</option>
                <option value="snack">Snack</option>
              </select>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  className="input-field" 
                  style={{ flex: 1 }}
                  placeholder="Ej: 2 huevos revueltos con un pan integral"
                  value={foodText}
                  onChange={e => setFoodText(e.target.value)}
                  disabled={loadingAI}
                />
                <button type="submit" className="btn-primary" disabled={loadingAI}>
                  {loadingAI ? 'Calculando...' : <><Send size={16}/> Enviar</>}
                </button>
              </div>
            </form>
          </div>

          <div className="glass-card" style={{ padding: '24px', flex: 1 }}>
            <h3 style={{ marginBottom: '16px' }}>Comidas Registradas Hoy</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(!foodLogs || foodLogs.length === 0) && (
                <p className="text-muted" style={{ fontSize: '14px' }}>No hay registros de comidas hoy.</p>
              )}
              {foodLogs?.map(fl => (
                <div key={fl.idFoodLog} style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{fl.type_meal?.toUpperCase()}</strong>
                    <span style={{ fontSize: '14px', color: 'var(--accent)' }}>{fl.calories} kcal</span>
                  </div>
                  <p style={{ margin: '8px 0', fontSize: '14px' }}>{fl.food}</p>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span>P: {fl.protein}g</span>
                    <span>C: {fl.carbs}g</span>
                    <span>G: {fl.fat}g</span>
                    <span>F: {fl.fiber}g</span>
                  </div>
                  <button 
                    className="btn-icon danger" 
                    style={{ position: 'absolute', right: '8px', bottom: '8px', padding: '4px' }}
                    onClick={() => handleDeleteFood(fl)}
                    title="Eliminar"
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
        <div className="modal-overlay">
          <div className="modal-content glass-card" style={{ maxWidth: '500px' }}>
            <button className="modal-close" onClick={() => setShowFormModal(false)}>
              <X size={20} />
            </button>
            <h2>{formMode === 'edit' ? 'Editar Formulario Actual' : 'Configurar Perfil & Meta (Nuevo)'}</h2>
            
            <form onSubmit={handleSaveForm} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Género</label>
                  <select className="input-field" value={formValues.gender} onChange={e => setFormValues({...formValues, gender: e.target.value})}>
                    <option value="M">Hombre</option>
                    <option value="F">Mujer</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Edad</label>
                  <input type="number" required className="input-field" value={formValues.edad} onChange={e => setFormValues({...formValues, edad: parseInt(e.target.value) || 0})} />
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Peso (kg)</label>
                  <input type="number" step="0.1" required className="input-field" value={formValues.peso} onChange={e => setFormValues({...formValues, peso: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Altura (cm)</label>
                  <input type="number" required className="input-field" value={formValues.altura} onChange={e => setFormValues({...formValues, altura: parseInt(e.target.value) || 0})} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Cuello (cm)</label>
                  <input type="number" step="0.1" className="input-field" value={formValues.cuello} onChange={e => setFormValues({...formValues, cuello: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Cintura (cm)</label>
                  <input type="number" step="0.1" className="input-field" value={formValues.cintura} onChange={e => setFormValues({...formValues, cintura: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Cadera (cm)</label>
                  <input type="number" step="0.1" className="input-field" value={formValues.cadera} onChange={e => setFormValues({...formValues, cadera: parseFloat(e.target.value) || 0})} />
                </div>
              </div>

              <div className="form-group">
                <label>Nivel de Actividad (1-Sedentario, 5-Muy Intenso)</label>
                <select className="input-field" value={formValues.nivelActividad} onChange={e => setFormValues({...formValues, nivelActividad: parseInt(e.target.value)})}>
                  <option value={1}>1 - Sedentario</option>
                  <option value={2}>2 - Ligero</option>
                  <option value={3}>3 - Moderado</option>
                  <option value={4}>4 - Intenso</option>
                  <option value={5}>5 - Muy Intenso</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Meta</label>
                  <select className="input-field" value={formValues.meta} onChange={e => setFormValues({...formValues, meta: e.target.value})}>
                    <option value="bajar">Bajar de Peso</option>
                    <option value="mantener">Mantener</option>
                    <option value="subir">Subir de Peso</option>
                  </select>
                </div>
                {formValues.meta !== 'mantener' && (
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Velocidad (kg/sem)</label>
                    <input type="number" step="0.1" className="input-field" value={formValues.velocidadKgSemana} onChange={e => setFormValues({...formValues, velocidadKgSemana: parseFloat(e.target.value) || 0})} />
                  </div>
                )}
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '8px' }}>
                Guardar y Calcular Macros
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
