import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, type ProyectoMetrica } from '../db/localDb';
import { getRegistroEvaluaciones, createRegistroEvaluacion, deleteRegistroEvaluacion, createPuntosGanados, deletePuntosGanados, getPuntosGanados } from '../services/api';
import { Activity, Trash2, Calendar, Check } from 'lucide-react';
import './EvaluacionView.css';

export function EvaluacionView() {
  const pmRelations = useLiveQuery(() => localDB.proyecto_metricas.filter(pm => pm.activo === 1).toArray(), []) || [];
  const proyectos = useLiveQuery(() => localDB.proyectos.toArray(), []) || [];
  const metricas = useLiveQuery(() => localDB.metricas.toArray(), []) || [];
  const registros = useLiveQuery(() => localDB.registro_evaluaciones.toArray(), []) || [];
  const puntosGanados = useLiveQuery(() => localDB.puntos_ganados.toArray(), []) || [];

  const [selectedPM, setSelectedPM] = useState<ProyectoMetrica | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [notas, setNotas] = useState('');

  const isDueToday = (pm: ProyectoMetrica) => {
    const configStr = pm.config_programacion;
    if (!configStr) return true; // Default if empty

    try {
      const parsed = typeof configStr === 'string' ? JSON.parse(configStr) : configStr;
      const freq = parsed.frequency_type;
      const interval = parsed.interval || 1;
      const config = parsed.config || {};
      
      // Find last evaluation
      const pmRegistros = registros.filter(r => r.id_proyecto_metrica === pm.id);
      pmRegistros.sort((a, b) => new Date(b.fecha_evaluacion).getTime() - new Date(a.fecha_evaluacion).getTime());
      const lastEval = pmRegistros.length > 0 ? new Date(pmRegistros[0].fecha_evaluacion) : null;
      
      const today = new Date();
      
      // Check if evaluated today
      let evaluatedToday = false;
      if (lastEval) {
        evaluatedToday = lastEval.getFullYear() === today.getFullYear() && 
                         lastEval.getMonth() === today.getMonth() && 
                         lastEval.getDate() === today.getDate();
      }
      if (evaluatedToday) return false;

      // Base Date for interval calculations
      const baseDate = pm.created_at ? new Date(pm.created_at) : today;

      if (freq === 'yearly' || freq === 'anual') {
        if (!lastEval) return true;
        const diffYears = today.getFullYear() - lastEval.getFullYear();
        return diffYears >= interval;
      }
      
      if (freq === 'diario') {
        if (!lastEval) return true;
        today.setHours(0,0,0,0);
        const lDate = new Date(lastEval);
        lDate.setHours(0,0,0,0);
        const diffDays = Math.ceil(Math.abs(today.getTime() - lDate.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= interval;
      }
      
      if (freq === 'semanal') {
        if (interval > 1) {
          const diffDays = Math.floor(Math.abs(today.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
          const diffWeeks = Math.floor(diffDays / 7);
          if (diffWeeks % interval !== 0) return false;
        }
        
        let currentDayOfWeek = today.getDay();
        if (currentDayOfWeek === 0) currentDayOfWeek = 7;
        const days = config.days_of_week || [];
        if (days.length > 0 && !days.includes(currentDayOfWeek)) return false;
        return true;
      }
      
      if (freq === 'mensual' || freq === 'monthly') {
        if (interval > 1) {
          const monthDiff = (today.getFullYear() - baseDate.getFullYear()) * 12 + (today.getMonth() - baseDate.getMonth());
          if (monthDiff % interval !== 0) return false;
        }
        
        const currentDayOfMonth = today.getDate();
        const dom = config.days_of_month || [];
        if (dom.length > 0 && dom.includes(currentDayOfMonth)) return true;
        
        const specific = config.specific_days || [];
        if (specific.length > 0) {
          let todayDow = today.getDay();
          if (todayDow === 0) todayDow = 7;
          
          for (const sp of specific) {
            const { occurrence, day_of_week } = sp;
            if (todayDow === day_of_week) {
              const occ = Math.ceil(currentDayOfMonth / 7);
              if (occ === occurrence) return true;
            }
          }
        }
        
        // If neither matched and one of them was specified, return false
        if (dom.length > 0 || specific.length > 0) return false;
        return true; // If no day specified, default to true for the month? Or false? Let's say true (every day of that month).
      }
    } catch (e) {
      console.error(e);
      return true;
    }
    return true;
  };

  useEffect(() => {
    getRegistroEvaluaciones().catch(console.error);
    getPuntosGanados().catch(console.error);
  }, []);

  const selectedMetrica = selectedPM ? metricas.find(m => m.id === selectedPM.id_metrica) : null;

  let schemaFields: {key: string, type: string}[] = [];
  let resultadosEsperados: any[] = [];
  
  if (selectedMetrica) {
    try {
      const s = typeof selectedMetrica.schema_esperado === 'string' ? JSON.parse(selectedMetrica.schema_esperado) : selectedMetrica.schema_esperado;
      schemaFields = Object.keys(s).map(k => ({ key: k, type: s[k] }));
    } catch {}
    try {
      if (selectedMetrica.resultados_esperado) {
        const r = typeof selectedMetrica.resultados_esperado === 'string' ? JSON.parse(selectedMetrica.resultados_esperado) : selectedMetrica.resultados_esperado;
        if (Array.isArray(r)) resultadosEsperados = r;
      }
    } catch {}
  }

  const handleSelectPM = (pm: ProyectoMetrica) => {
    setSelectedPM(pm);
    setFormValues({});
    setNotas('');
  };

  const calculatePoints = () => {
    if (!selectedMetrica) return 0;
    let totalPoints = selectedMetrica.points || 0;

    resultadosEsperados.forEach(cond => {
      if (!cond.target_attribute || formValues[cond.target_attribute] === undefined) return;
      
      const inputValue = parseFloat(formValues[cond.target_attribute]);
      const targetValue = parseFloat(cond.value);
      
      if (isNaN(inputValue) || isNaN(targetValue)) return;

      let match = false;
      switch (cond.condition) {
        case '>=': match = inputValue >= targetValue; break;
        case '<=': match = inputValue <= targetValue; break;
        case '==': match = inputValue === targetValue; break;
        case '>': match = inputValue > targetValue; break;
        case '<': match = inputValue < targetValue; break;
      }

      if (match && cond.points_change) {
        const changeStr = cond.points_change.toString().trim();
        if (changeStr.startsWith('+')) {
          totalPoints += parseFloat(changeStr.replace('+', ''));
        } else if (changeStr.startsWith('-')) {
          totalPoints -= parseFloat(changeStr.replace('-', ''));
        } else if (changeStr.startsWith('x') || changeStr.startsWith('*')) {
          totalPoints *= parseFloat(changeStr.substring(1));
        } else {
          totalPoints += parseFloat(changeStr);
        }
      }
    });

    return totalPoints;
  };

  const handleSaveEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPM) return;

    const pointsToAward = calculatePoints();

    const evalId = await createRegistroEvaluacion({
      id_proyecto_metrica: selectedPM.id,
      fecha_evaluacion: new Date().toISOString(),
      valores: formValues,
      notas: notas
    });

    await createPuntosGanados({
      id_registro_evaluacion: evalId,
      points: pointsToAward,
      fecha_registro: new Date().toISOString()
    });

    setSelectedPM(null);
  };

  const handleDeleteEvaluation = async (id: number) => {
    if (confirm('¿Eliminar esta evaluación y sus puntos asociados?')) {
      const p = puntosGanados.find(pg => pg.id_registro_evaluacion === id);
      if (p && p.id) {
        await deletePuntosGanados(p.id);
      }
      await deleteRegistroEvaluacion(id);
    }
  };

  return (
    <div className="evaluacion-container">
      <div className="evaluacion-header">
        <h1>Evaluaciones</h1>
        <p>Registra y evalúa tus métricas planificadas.</p>
      </div>

      <div className="evaluacion-layout">
        <div className="evaluacion-sidebar glass-card">
          <h2>Métricas Pendientes Hoy</h2>
          <div className="pm-list">
            {pmRelations.filter(pm => isDueToday(pm)).length === 0 && (
              <p className="text-muted">No hay métricas programadas para hoy.</p>
            )}
            {pmRelations.filter(pm => isDueToday(pm)).map(pm => {
              const p = proyectos.find(x => x.id === pm.id_proyecto);
              const m = metricas.find(x => x.id === pm.id_metrica);
              if (!p || !m) return null;

              return (
                <div 
                  key={pm.id} 
                  className={`pm-card ${selectedPM?.id === pm.id ? 'active' : ''}`}
                  onClick={() => handleSelectPM(pm)}
                >
                  <Activity size={16} />
                  <div>
                    <strong>{m.nombre}</strong>
                    <span className="text-muted" style={{display:'block', fontSize: '12px'}}>{p.nombre}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="evaluacion-content glass-card">
          {!selectedPM ? (
            <div className="empty-state">
              <Activity size={48} color="var(--text-muted)" />
              <p>Selecciona una métrica para evaluarla</p>
            </div>
          ) : (
            <div>
              <div className="form-header">
                <h2>Evaluar: {selectedMetrica?.nombre}</h2>
                <span className="badge-points">Base: {selectedMetrica?.points} pts</span>
              </div>
              <p className="text-muted">{selectedMetrica?.descripcion}</p>

              <form onSubmit={handleSaveEvaluation} className="evaluacion-form">
                <div className="schema-inputs">
                  {schemaFields.map(field => (
                    <div key={field.key} className="form-group">
                      <label>{field.key}</label>
                      <input 
                        type={field.type === 'number' ? 'number' : 'text'} 
                        step="any"
                        className="form-input" 
                        required 
                        value={formValues[field.key] || ''}
                        onChange={e => setFormValues({...formValues, [field.key]: e.target.value})}
                      />
                    </div>
                  ))}
                </div>
                
                <div className="form-group">
                  <label>Notas Adicionales</label>
                  <textarea 
                    className="form-textarea" 
                    rows={3} 
                    value={notas}
                    onChange={e => setNotas(e.target.value)}
                  />
                </div>

                <div className="calc-preview">
                  Puntos a ganar: <strong>{calculatePoints()} pts</strong>
                </div>

                <button type="submit" className="btn-primary w-100">
                  <Check size={18} /> Guardar Evaluación
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      <div className="historial-evaluaciones glass-card">
        <h2>Historial de Evaluaciones</h2>
        <div className="historial-grid">
          {registros.map(r => {
            const pm = pmRelations.find(x => x.id === r.id_proyecto_metrica);
            const met = pm ? metricas.find(x => x.id === pm.id_metrica) : null;
            const pts = puntosGanados.find(x => x.id_registro_evaluacion === r.id);

            return (
              <div key={r.id} className="historial-card">
                <div className="historial-header">
                  <strong>{met ? met.nombre : 'Desconocida'}</strong>
                  <button className="btn-icon danger" onClick={() => handleDeleteEvaluation(r.id!)}><Trash2 size={16} /></button>
                </div>
                <div className="historial-body">
                  <span className="text-muted"><Calendar size={12}/> {new Date(r.fecha_evaluacion).toLocaleDateString()}</span>
                  <span>{pts ? `${pts.points >= 0 ? '+' : ''}${pts.points} pts` : '-- pts'}</span>
                </div>
              </div>
            );
          })}
          {registros.length === 0 && <p className="text-muted">No hay evaluaciones registradas aún.</p>}
        </div>
      </div>
    </div>
  );
}
