import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB } from '../db/localDb';
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
  getRewards
} from '../services/api';
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
        getRewards()
      ]).catch(console.error);
    }
  }, []);

  const pointReview = useLiveQuery(() => localDB.point_review.get(1), []) || { total_puntos: 0 };
  const totalPuntos = pointReview.total_puntos;

  // Data for charts
  const formularios = useLiveQuery(async () => {
    const data = await localDB.formularios.toArray();
    return data.sort((a, b) => (a.fechaRegistro || '').localeCompare(b.fechaRegistro || ''));
  }, []) || [];
  const proyectos = useLiveQuery(() => localDB.proyectos.filter(p => p.estado === 1).toArray(), []) || [];
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
    
    // Find all metrics for this project
    const pMetrics = proyectoMetricas.filter(pm => pm.id_proyecto === selectedProjectId);
    
    // Group records by metric
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
          date: r.fecha_evaluacion ? r.fecha_evaluacion.slice(0, 10) : '', // Take only date part
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
    }).filter(m => m.data.length > 0); // Only return metrics with data
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
          <h1>Good Evening, <span style={{ color: 'var(--accent-primary)' }}>User</span></h1>
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