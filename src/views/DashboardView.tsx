import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, type ProyectoHabito, type ProyectoTarea } from '../db/localDb';
import { SyncIndicator } from '../components/SyncIndicator';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { 
  getPointReviewTotal, 
  getFormularios, 
  getProyectos, 
  getMetricas, 
  getProyectoMetricas, 
  getRegistroEvaluaciones,
  getPuntosUsados,
  getRewards,
  getProyectoHabitos,
  getProyectoTareas,
  getRegistroHabitos,
  getRegistroTareas,
  createRegistroHabito,
  updateRegistroHabito,
  createRegistroTarea,
  updateRegistroTarea,
  updateProyectoHabito,
  createPuntosGanados
} from '../services/api';
import { 
  Flame, ChevronDown, ChevronUp, Check, Play, 
  Clock, CheckCircle2, Award
} from 'lucide-react';
import './DashboardView.css';

export function DashboardView() {
  // 1. Total Proyectos
  const totalProyectos = useLiveQuery(() => localDB.proyectos.count(), []) || 0;
  
  // 2. Total Tareas
  const totalTareas = useLiveQuery(() => localDB.tasks.count(), []) || 0;

  useEffect(() => {
    if (navigator.onLine) {
      Promise.all([
        getPointReviewTotal(),
        getFormularios(),
        getProyectos(),
        getMetricas(),
        getProyectoMetricas(),
        getRegistroEvaluaciones(),
        getPuntosUsados(),
        getRewards(),
        getProyectoHabitos(),
        getProyectoTareas(),
        getRegistroHabitos(),
        getRegistroTareas()
      ]).catch(console.error);
    }
  }, []);

  const pointReview = useLiveQuery(() => localDB.point_review.get(1), []) || { total_puntos: 0 };
  const totalPuntos = pointReview.total_puntos;

  // Data for habits and micro-tasks
  const proyectos = useLiveQuery(() => localDB.proyectos.filter(p => p.estado === 1).toArray(), []) || [];
  const habitos = useLiveQuery(() => localDB.proyecto_habitos.filter(h => h.activo === 1).toArray(), []) || [];
  const todasTareas = useLiveQuery(() => localDB.proyecto_tareas.filter(t => t.activo === 1).toArray(), []) || [];
  const registroHabitos = useLiveQuery(() => localDB.registro_habitos.toArray(), []) || [];
  const registroTareas = useLiveQuery(() => localDB.registro_tareas.toArray(), []) || [];

  const [expandedHabits, setExpandedHabits] = useState<Record<number, boolean>>({});

  const toggleExpand = (habId: number) => {
    setExpandedHabits(prev => ({ ...prev, [habId]: !prev[habId] }));
  };

  // Hoy y día de la semana
  const dayNames = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const todayDayName = dayNames[new Date().getDay()];
  const todayStr = new Date().toLocaleDateString('en-CA'); // "YYYY-MM-DD"

  // Filtrar hábitos programados para hoy (o todos los hábitos si ninguno tiene el día asignado)
  const habitosDeHoy = useMemo(() => {
    return habitos.map(h => {
      let dias: Record<string, boolean> = {};
      if (typeof h.dias_semana === 'string') {
        try { dias = JSON.parse(h.dias_semana); } catch {}
      } else if (typeof h.dias_semana === 'object') {
        dias = h.dias_semana as any;
      }
      
      const tocaHoy = dias[todayDayName] !== false; // true si está marcado o por defecto
      const proyecto = proyectos.find(p => p.id === h.id_proyecto);
      const tareas = todasTareas.filter(t => t.id_proyecto_habito === h.id).sort((a, b) => a.orden - b.orden);
      
      const regHabito = registroHabitos.find(r => r.id_proyecto_habito === h.id && r.fecha === todayStr);
      
      const tareasStatus = tareas.map(t => {
        const regTarea = regHabito 
          ? registroTareas.find(rt => rt.id_registro_habito === regHabito.id && rt.id_proyecto_tarea === t.id)
          : undefined;
        const completado = regTarea?.completado === 1;
        return { tarea: t, completado, regTarea };
      });

      const totalTareasCount = tareas.length;
      const completadasCount = tareasStatus.filter(ts => ts.completado).length;
      const completadoHoy = regHabito?.completado === 1 || (totalTareasCount > 0 && completadasCount === totalTareasCount);

      return {
        habito: h,
        proyecto,
        tocaHoy,
        tareas: tareasStatus,
        totalTareasCount,
        completadasCount,
        regHabito,
        completadoHoy
      };
    });
  }, [habitos, proyectos, todasTareas, registroHabitos, registroTareas, todayDayName, todayStr]);

  // Completar o desmarcar mini-tarea
  const handleToggleTask = async (habito: ProyectoHabito, tarea: ProyectoTarea, currentDone: boolean) => {
    if (!habito.id || !tarea.id) return;

    // 1. Buscar o crear el registro_habito de hoy
    let regHab = registroHabitos.find(r => r.id_proyecto_habito === habito.id && r.fecha === todayStr);
    let regHabId = regHab?.id;

    if (!regHabId) {
      regHabId = Number(await createRegistroHabito({
        id_proyecto_habito: habito.id,
        fecha: todayStr,
        completado: 0,
        streak_actual: habito.record_streak || 0,
        points_ganados: 0,
        notas: ''
      }));
    }

    if (!regHabId) return;

    // 2. Crear o actualizar registro_tarea
    const newDone = currentDone ? 0 : 1;
    const existingRT = registroTareas.find(rt => rt.id_registro_habito === regHabId && rt.id_proyecto_tarea === tarea.id);

    if (existingRT?.id) {
      await updateRegistroTarea(existingRT.id, {
        ...existingRT,
        completado: newDone,
        fecha_completado: newDone === 1 ? new Date().toISOString() : null
      });
    } else {
      await createRegistroTarea({
        id_proyecto_tarea: tarea.id,
        id_registro_habito: regHabId,
        completado: newDone,
        fecha_completado: newDone === 1 ? new Date().toISOString() : null,
        tiempo_real_minutos: tarea.tiempo_estimado_minutos
      });
    }

    // 3. Evaluar completitud total del hábito
    const habitTareas = todasTareas.filter(t => t.id_proyecto_habito === habito.id);
    const updatedRTs = await localDB.registro_tareas.filter(rt => rt.id_registro_habito === regHabId).toArray();
    const doneMap = new Map(updatedRTs.map(rt => [rt.id_proyecto_tarea, rt.completado === 1]));
    doneMap.set(tarea.id, newDone === 1);

    const allFinished = habitTareas.length > 0 && habitTareas.every(t => doneMap.get(t.id!) === true);

    if (allFinished && regHab?.completado !== 1) {
      const newStreak = (habito.record_streak || 0) + 1;
      const newBestStreak = Math.max(habito.best_streak || 0, newStreak);
      const pointsToAward = habito.points_por_completar || 10;

      await updateRegistroHabito(regHabId, {
        id_proyecto_habito: habito.id,
        fecha: todayStr,
        completado: 1,
        fecha_completado: new Date().toISOString(),
        points_ganados: pointsToAward,
        streak_actual: newStreak
      });

      await updateProyectoHabito(habito.id, {
        record_streak: newStreak,
        best_streak: newBestStreak,
        ultima_fecha_completada: todayStr
      });

      await createPuntosGanados({
        id_registro_habito: regHabId,
        points: pointsToAward,
        tipo_origen: 'habito',
        fecha_registro: new Date().toISOString()
      });

      const pr = await localDB.point_review.get(1);
      if (pr) {
        await localDB.point_review.put({ id: 1, total_puntos: pr.total_puntos + pointsToAward });
      }
    } else if (!allFinished && regHab?.completado === 1) {
      await updateRegistroHabito(regHabId, {
        ...regHab,
        completado: 0,
        fecha_completado: null
      });
    }
  };

  // Data for charts
  const formularios = useLiveQuery(async () => {
    const data = await localDB.formularios.toArray();
    return data.sort((a, b) => (a.fechaRegistro || '').localeCompare(b.fechaRegistro || ''));
  }, []) || [];
  const metricas = useLiveQuery(() => localDB.metricas.filter(m => m.estado === 1).toArray(), []) || [];
  const proyectoMetricas = useLiveQuery(() => localDB.proyecto_metricas.filter(pm => pm.activo === 1).toArray(), []) || [];
  const registros = useLiveQuery(async () => {
    const data = await localDB.registro_evaluaciones.toArray();
    return data.sort((a, b) => (a.fecha_evaluacion || '').localeCompare(b.fecha_evaluacion || ''));
  }, []) || [];

  const [selectedProjectId, setSelectedProjectId] = useState<number | ''>('');

  // Body Evolution Data (Weight, Waist, Body Fat)
  const bodyEvolutionData = useMemo(() => {
    return formularios.map(f => {
      let bodyFat = null;
      if (f.cintura && f.cuello && f.altura) {
        if (f.gender === 'M') {
          bodyFat = 495 / (1.0324 - 0.19077 * Math.log10(f.cintura - f.cuello) + 0.15456 * Math.log10(f.altura)) - 450;
        } else if (f.gender === 'F' && f.cadera) {
          bodyFat = 495 / (1.29579 - 0.35004 * Math.log10(f.cintura + f.cadera - f.cuello) + 0.22100 * Math.log10(f.altura)) - 450;
        }
      }
      return {
        date: f.fechaRegistro,
        peso: f.peso,
        cintura: f.cintura,
        bodyFat: bodyFat ? parseFloat(bodyFat.toFixed(1)) : null
      };
    });
  }, [formularios]);

  // Project Metrics Analysis Data
  const projectMetricsData = useMemo(() => {
    if (!selectedProjectId) return [];
    
    const pMetrics = proyectoMetricas.filter(pm => pm.id_proyecto === selectedProjectId);
    
    return pMetrics.map(pm => {
      const metric = metricas.find(m => m.id === pm.id_metrica);
      const pmRegistros = registros.filter(r => r.id_proyecto_metrica === pm.id);
      
      const chartData = pmRegistros.map(r => {
        let vals: any = {};
        try { 
          vals = typeof r.valores === 'string' ? JSON.parse(r.valores) : r.valores; 
          
          if (vals && typeof vals === 'object') {
            Object.keys(vals).forEach(k => {
              if (typeof vals[k] === 'string' && vals[k] !== '' && !isNaN(Number(vals[k]))) {
                vals[k] = Number(vals[k]);
              }
            });
          }
        } catch {}
        return {
          date: r.fecha_evaluacion ? r.fecha_evaluacion.slice(0, 10) : '',
          ...vals
        };
      });

      let keys: string[] = [];
      if (metric && metric.schema_esperado) {
        try {
          const schema = typeof metric.schema_esperado === 'string' ? JSON.parse(metric.schema_esperado) : metric.schema_esperado;
          keys = Object.keys(schema);
        } catch {}
      } else if (chartData.length > 0) {
        keys = Object.keys(chartData[0]).filter(k => k !== 'date');
      }

      return {
        pm,
        metric,
        keys,
        data: chartData
      };
    }).filter(m => m.data.length > 0);
  }, [selectedProjectId, proyectoMetricas, metricas, registros]);

  const puntosHoy = useLiveQuery(async () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const today = new Date(now.getTime() - offset).toISOString().slice(0, 10);
    
    const usados = await localDB.puntos_usados
      .filter(p => {
        if (!p.reclaim_date) return false;
        const d = new Date(p.reclaim_date);
        const localDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        return localDate === today;
      })
      .toArray();
    
    let totalGastados = 0;
    for (const uso of usados) {
      const reward = await localDB.rewards.get(uso.id_reward);
      if (reward) totalGastados += reward.points_need;
    }

    return { totalGastados };
  }, []) || { totalGastados: 0 };

  return (
    <div className="dashboard-container">
      
      {/* ── HEADER ── */}
      <header className="dashboard-header">
        <div className="dashboard-header-title">
          <h1>Good Day, <span style={{ color: 'var(--accent-primary)' }}>Tracker</span></h1>
          <p>Stay focused and make it happen.</p>
        </div>
        <div className="glass-card" style={{ padding: '10px 20px' }}>
          <SyncIndicator />
        </div>
      </header>

      {/* ── MÉTRICAS PRINCIPALES ── */}
      <section className="stats-grid">
        <div className="glass-card stat-card">
          <span className="stat-number">{totalProyectos}</span>
          <span className="stat-label">Proyectos Totales</span>
        </div>
        <div className="glass-card stat-card">
          <span className="stat-number">{totalTareas}</span>
          <span className="stat-label">Tareas Totales</span>
        </div>
        <div className="glass-card stat-card">
          <span className="stat-number" style={{ color: '#10b981' }}>{totalPuntos}</span>
          <span className="stat-label">Puntos Totales (Disponibles)</span>
        </div>
        <div className="glass-card stat-card">
          <span className="stat-number" style={{ color: '#ef4444' }}>-{puntosHoy.totalGastados}</span>
          <span className="stat-label">Puntos Gastados</span>
        </div>
      </section>

      {/* ── SECCIÓN MICRO HABITS (TRACKING DIARIO) ── */}
      <section className="micro-habits-section">
        <div className="micro-habits-header">
          <h2>
            <Flame style={{ color: '#f59e0b' }} /> Micro Habits ({habitosDeHoy.length})
          </h2>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
          </span>
        </div>

        {habitosDeHoy.length === 0 ? (
          <div className="glass-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ margin: 0 }}>No hay hábitos configurados para hoy. Ve a tus <strong>Áreas y Proyectos</strong> para activar hábitos y mini-tareas.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {habitosDeHoy.map(({ habito, proyecto, tareas, totalTareasCount, completadasCount, completadoHoy }) => {
              const isExpanded = !!expandedHabits[habito.id!];
              const streak = habito.record_streak || 0;

              return (
                <div key={habito.id} className={`habit-card ${completadoHoy ? 'completed' : ''}`}>
                  {/* Cabecera del Hábito */}
                  <div className="habit-card-header" onClick={() => toggleExpand(habito.id!)}>
                    <div className="habit-card-left">
                      {/* Badge de Progreso Circular */}
                      <div className={`habit-progress-badge ${completadoHoy ? 'all-done' : ''}`}>
                        {completadoHoy ? <Check size={20} /> : `${completadasCount}/${totalTareasCount}`}
                      </div>

                      {/* Información y Título */}
                      <div className="habit-info">
                        <h3 className="habit-title">
                          {proyecto?.nombre || `Proyecto #${habito.id_proyecto}`}
                        </h3>
                        <div className="habit-streak-row">
                          <div className="streak-dots">
                            {[1, 2, 3, 4, 5].map(dotIdx => (
                              <div
                                key={dotIdx}
                                className={`streak-dot ${streak >= dotIdx || (streak > 0 && (streak % 5 >= dotIdx || streak % 5 === 0)) ? 'active' : ''}`}
                              />
                            ))}
                          </div>
                          <span>{streak} day streak</span>
                        </div>
                      </div>
                    </div>

                    <div className="habit-card-right">
                      {habito.hora_objetivo && (
                        <span className="habit-due-time">
                          <Clock size={13} /> {habito.hora_objetivo.slice(0, 5)}
                        </span>
                      )}
                      {completadoHoy && (
                        <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Award size={13} /> +{habito.points_por_completar} pts
                        </span>
                      )}
                      <button
                        type="button"
                        className="btn-icon"
                        style={{ padding: '6px', color: 'var(--text-muted)' }}
                        onClick={(e) => { e.stopPropagation(); toggleExpand(habito.id!); }}
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Contenido Expandido: Meta y Timeline de Mini-Tareas */}
                  {isExpanded && (
                    <div className="habit-expanded-content">
                      {proyecto?.meta && (
                        <div className="habit-outcome">
                          <strong>Outcome:</strong> {proyecto.meta}
                        </div>
                      )}

                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                        Habits:
                      </div>

                      {tareas.length === 0 ? (
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
                          No hay mini-tareas registradas para este hábito.
                        </p>
                      ) : (
                        <div className="habit-timeline">
                          {tareas.map(({ tarea, completado }, idx) => {
                            const isNextDone = idx < tareas.length - 1 && tareas[idx + 1].completado;

                            return (
                              <div key={tarea.id} className="habit-timeline-item">
                                {/* Línea vertical conectora */}
                                {idx < tareas.length - 1 && (
                                  <div className={`timeline-connector ${completado && isNextDone ? 'completed' : ''}`} />
                                )}

                                {/* Tiempo estimado */}
                                <div className="timeline-time">
                                  {tarea.tiempo_estimado_minutos} min
                                </div>

                                {/* Nodo circular */}
                                <div
                                  className={`timeline-node ${completado ? 'done' : ''}`}
                                  onClick={() => handleToggleTask(habito, tarea, completado)}
                                >
                                  {completado && <Check size={13} />}
                                </div>

                                {/* Contenido de la tarea */}
                                <div className="timeline-content">
                                  <div>
                                    <div className={`timeline-title ${completado ? 'done' : ''}`}>
                                      {tarea.nombre}
                                    </div>
                                    {tarea.descripcion && (
                                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        {tarea.descripcion}
                                      </div>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    className={`timeline-action-btn ${completado ? 'done' : ''}`}
                                    onClick={() => handleToggleTask(habito, tarea, completado)}
                                    title={completado ? 'Desmarcar tarea' : 'Completar tarea'}
                                  >
                                    {completado ? <CheckCircle2 size={16} /> : <Play size={14} style={{ marginLeft: '2px' }} />}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── CONTENIDO INFERIOR ── */}
      <section className="dashboard-main-grid">
        
        {/* Columna Izquierda (Gráficos) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Evolución Corporal */}
          {bodyEvolutionData.length > 0 && (
            <div className="glass-card" style={{ padding: '24px' }}>
              <h2 style={{ marginBottom: '16px', color: 'var(--text-main)' }}>Evolución Corporal</h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                <div style={{ height: '250px' }}>
                  <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px', textAlign: 'center' }}>Peso (kg)</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={bodyEvolutionData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="date" stroke="var(--text-muted)" tick={{ fontSize: 12 }} />
                      <YAxis domain={['auto', 'auto']} stroke="var(--text-muted)" tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: 'none', borderRadius: '8px' }} />
                      <Line type="monotone" dataKey="peso" stroke="var(--accent-primary)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                
                <div style={{ height: '250px' }}>
                  <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px', textAlign: 'center' }}>Cintura (cm)</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={bodyEvolutionData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="date" stroke="var(--text-muted)" tick={{ fontSize: 12 }} />
                      <YAxis domain={['auto', 'auto']} stroke="var(--text-muted)" tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: 'none', borderRadius: '8px' }} />
                      <Line type="monotone" dataKey="cintura" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ height: '250px' }}>
                  <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px', textAlign: 'center' }}>% Grasa Corporal (US Navy)</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={bodyEvolutionData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="date" stroke="var(--text-muted)" tick={{ fontSize: 12 }} />
                      <YAxis domain={['auto', 'auto']} stroke="var(--text-muted)" tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: 'none', borderRadius: '8px' }} />
                      <Line type="monotone" dataKey="bodyFat" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Análisis de Métricas */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ color: 'var(--text-main)', margin: 0, wordBreak: 'break-word' }}>Análisis de Proyecto</h2>
              <select 
                className="glass-input" 
                style={{ width: '100%', maxWidth: '250px', padding: '8px 12px' }}
                value={selectedProjectId} 
                onChange={(e) => setSelectedProjectId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">-- Selecciona un Proyecto --</option>
                {proyectos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            {!selectedProjectId && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
                Selecciona un proyecto para ver sus métricas
              </div>
            )}

            {selectedProjectId && projectMetricsData.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
                No hay registros de evaluación para este proyecto
              </div>
            )}

            {projectMetricsData.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                {projectMetricsData.map((mData) => (
                  <div key={mData.pm.id} style={{ height: '250px' }}>
                    <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px', textAlign: 'center' }}>
                      {mData.metric ? mData.metric.nombre : `Métrica #${mData.pm.id_metrica}`}
                    </h3>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={mData.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="date" stroke="var(--text-muted)" tick={{ fontSize: 12 }} />
                        <YAxis stroke="var(--text-muted)" tick={{ fontSize: 12 }} />
                        <Tooltip contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: 'none', borderRadius: '8px' }} />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        {mData.keys.map((key, kIdx) => {
                          const colors = ['var(--accent-primary)', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
                          return (
                            <Line key={key} type="monotone" dataKey={key} stroke={colors[kIdx % colors.length]} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div className="glass-card" style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)', color: 'white', padding: '24px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 'clamp(16px, 4vw, 20px)', wordBreak: 'break-word', lineHeight: '1.4' }}>
              {new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h3>
            <p style={{ margin: 0, opacity: 0.9 }}>Estado: Local-First Activo</p>
          </div>

          <div className="glass-card" style={{ textAlign: 'center', padding: '24px' }}>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Focus Timer</p>
            <h1 style={{ fontSize: '48px', margin: '16px 0', color: 'var(--text-main)', fontWeight: 'bold' }}>25:00</h1>
            <button className="btn-primary" style={{ width: '100%', padding: '16px', fontSize: '16px' }}>
              Start Focus
            </button>
          </div>

        </div>

      </section>

    </div>
  );
}