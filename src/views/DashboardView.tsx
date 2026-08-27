import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, type ProyectoHabito, type ProyectoTarea, type PagoProgramado } from '../db/localDb';
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
  createPuntosGanados,
  getMedios,
  getMovimientos,
  getCategoriasFinanzas,
  getAlertasPago,
  marcarAlertaLeida,
  getPresupuestos,
  getPagosProgramados,
  pagarPagoProgramado,
  getEgresosFijos
} from '../services/api';
import { 
  Flame, ChevronDown, ChevronUp, Check, Play, 
  Clock, CheckCircle2, Award, Wallet, ArrowDownRight,
  ArrowUpRight, Bell, CreditCard, Banknote, PieChart, CheckCheck, X, AlertCircle
} from 'lucide-react';
import './DashboardView.css';

export function DashboardView() {
  const [isInitialSyncing, setIsInitialSyncing] = useState(true);

  // 1. Total Proyectos
  const totalProyectos = useLiveQuery(() => localDB.proyectos.count(), []) || 0;
  
  // 2. Total Tareas
  const totalTareas = useLiveQuery(() => localDB.tasks.count(), []) || 0;

  useEffect(() => {
    let isMounted = true;
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
        getRegistroTareas(),
        getMedios(),
        getMovimientos(),
        getCategoriasFinanzas(),
        getAlertasPago(),
        getPresupuestos(),
        getPagosProgramados(),
        getEgresosFijos()
      ])
        .catch(console.error)
        .finally(() => {
          if (isMounted) setIsInitialSyncing(false);
        });
    } else {
      setIsInitialSyncing(false);
    }
    return () => {
      isMounted = false;
    };
  }, []);

  const pointReview = useLiveQuery(() => localDB.point_review.get(1), []) || { total_puntos: 0 };
  const totalPuntos = pointReview.total_puntos;

  // Data for habits and micro-tasks
  const proyectos = useLiveQuery(() => localDB.proyectos.filter(p => p.estado === 1).toArray(), []) || [];
  const habitos = useLiveQuery(() => localDB.proyecto_habitos.filter(h => h.activo === 1).toArray(), []) || [];
  const todasTareas = useLiveQuery(() => localDB.proyecto_tareas.filter(t => t.activo === 1).toArray(), []) || [];
  const registroHabitos = useLiveQuery(() => localDB.registro_habitos.toArray(), []) || [];
  const registroTareas = useLiveQuery(() => localDB.registro_tareas.toArray(), []) || [];

  // Data for Finanzas
  const medios = useLiveQuery(() => localDB.medios.filter(m => m.estado === 1).toArray(), []) || [];
  const movimientos = useLiveQuery(() => localDB.movimientos.toArray(), []) || [];
  const categoriasFinanzas = useLiveQuery(() => localDB.categorias_finanzas.toArray(), []) || [];
  const alertasPago = useLiveQuery(() => localDB.alertas_pago.filter(a => a.leida === 0).toArray(), []) || [];
  const presupuestos = useLiveQuery(() => localDB.presupuestos.filter(p => p.activo === 1).toArray(), []) || [];
  const pagosProgramados = useLiveQuery(() => localDB.pagos_programados.toArray(), []) || [];
  const egresosFijos = useLiveQuery(() => localDB.egresos_fijos.toArray(), []) || [];

  const [expandedHabits, setExpandedHabits] = useState<Record<number, boolean>>({});

  const toggleExpand = (habId: number) => {
    setExpandedHabits(prev => ({ ...prev, [habId]: !prev[habId] }));
  };

  // Hoy y día de la semana
  const dayNames = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const todayDayName = dayNames[new Date().getDay()];
  const todayStr = new Date().toLocaleDateString('en-CA'); // "YYYY-MM-DD"

  // ── Finanzas: Cálculos de Saldo y Periodo ──
  const saldoTotalFinanzas = useMemo(() => {
    try {
      return (medios || []).reduce((acc, m) => acc + (Number(m?.saldo_actual) || 0), 0);
    } catch (err) {
      console.error("Error calculando saldoTotalFinanzas:", err);
      return 0;
    }
  }, [medios]);

  const [periodoFinanzas, setPeriodoFinanzas] = useState<'hoy' | 'semana' | 'mes'>('mes');

  const movimientosFiltradosPeriodo = useMemo(() => {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`; // ej: "2026-08-24"
      const currMonthStr = `${year}-${month}`;   // ej: "2026-08"

      // Calcular Lunes y Domingo de la semana actual (Lunes = 1, Domingo = 7)
      const dayOfWeek = now.getDay(); // 0 es Domingo, 1 es Lunes, etc.
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
      const monYear = monday.getFullYear();
      const monMonth = String(monday.getMonth() + 1).padStart(2, '0');
      const monDay = String(monday.getDate()).padStart(2, '0');
      const mondayStr = `${monYear}-${monMonth}-${monDay}`;

      const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
      const sunYear = sunday.getFullYear();
      const sunMonth = String(sunday.getMonth() + 1).padStart(2, '0');
      const sunDay = String(sunday.getDate()).padStart(2, '0');
      const sundayStr = `${sunYear}-${sunMonth}-${sunDay}`;

      const extractFecha = (raw: any): string => {
        if (raw === null || raw === undefined) return '';
        if (typeof raw === 'number') {
          const d = new Date(raw < 10000000000 ? raw * 1000 : raw);
          if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const da = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${da}`;
          }
        }
        if (raw instanceof Date && !isNaN(raw.getTime())) {
          const y = raw.getFullYear();
          const m = String(raw.getMonth() + 1).padStart(2, '0');
          const da = String(raw.getDate()).padStart(2, '0');
          return `${y}-${m}-${da}`;
        }
        const str = String(raw).trim();
        const match = str.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
        if (match) {
          return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        }
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const da = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${da}`;
        }
        return '';
      };

      const result = (movimientos || []).filter(m => {
        if (!m) return false;
        const rawDate = m.fecha_movimiento ?? (m as any).fecha ?? (m as any).fechaMovimiento ?? m.created_at;
        const fecha = extractFecha(rawDate);
        if (!fecha) return false;

        if (periodoFinanzas === 'hoy') {
          return fecha === todayStr;
        }
        if (periodoFinanzas === 'semana') {
          return fecha >= mondayStr && fecha <= sundayStr;
        }
        if (periodoFinanzas === 'mes') {
          return fecha.startsWith(currMonthStr);
        }
        return true;
      });

      console.log(`[Dashboard Finanzas] Periodo: ${periodoFinanzas}, Hoy: ${todayStr}, Semana: ${mondayStr} a ${sundayStr}, Total: ${movimientos?.length || 0}, Filtrados: ${result.length}`);

      return result;
    } catch (err) {
      console.error("[Dashboard Finanzas] Error filtrando movimientos:", err);
      return movimientos || [];
    }
  }, [movimientos, periodoFinanzas]);

  const totalIngresosPeriodo = useMemo(() => {
    try {
      return (movimientosFiltradosPeriodo || [])
        .filter(m => m && m.tipo === 'I')
        .reduce((sum, m) => sum + (Number(m.monto) || 0), 0);
    } catch (err) {
      console.error("Error calculando totalIngresosPeriodo:", err);
      return 0;
    }
  }, [movimientosFiltradosPeriodo]);

  const totalEgresosPeriodo = useMemo(() => {
    try {
      return (movimientosFiltradosPeriodo || [])
        .filter(m => m && m.tipo === 'E')
        .reduce((sum, m) => sum + (Number(m.monto) || 0), 0);
    } catch (err) {
      console.error("Error calculando totalEgresosPeriodo:", err);
      return 0;
    }
  }, [movimientosFiltradosPeriodo]);

  // Desglose de egresos por categoría en el periodo
  const egresosPorCategoria = useMemo(() => {
    try {
      const catMap = new Map<string, number>();
      (movimientosFiltradosPeriodo || [])
        .filter(m => m && m.tipo === 'E')
        .forEach(m => {
          const cat = (categoriasFinanzas || []).find(c => c && c.id === m.categoria_id)?.categoria || 'Sin categoría';
          catMap.set(cat, (catMap.get(cat) || 0) + (Number(m.monto) || 0));
        });
      return Array.from(catMap.entries()).map(([nombre, total]) => ({ nombre, total }));
    } catch (err) {
      console.error("Error calculando egresosPorCategoria:", err);
      return [];
    }
  }, [movimientosFiltradosPeriodo, categoriasFinanzas]);

  // Desglose de egresos por medio en el periodo
  const egresosPorMedio = useMemo(() => {
    try {
      const medMap = new Map<string, number>();
      (movimientosFiltradosPeriodo || [])
        .filter(m => m && m.tipo === 'E')
        .forEach(m => {
          const med = (medios || []).find(med => med && med.id === m.medio_id)?.medio || 'Otro';
          medMap.set(med, (medMap.get(med) || 0) + (Number(m.monto) || 0));
        });
      return Array.from(medMap.entries()).map(([nombre, total]) => ({ nombre, total }));
    } catch (err) {
      console.error("Error calculando egresosPorMedio:", err);
      return [];
    }
  }, [movimientosFiltradosPeriodo, medios]);

  // Notificaciones PWA
  const triggerNotificationPrompt = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted' && alertasPago.length > 0) {
        new Notification('Alertas de Pago - TrackerApp', {
          body: `Tienes ${alertasPago.length} alerta(s) de pago pendiente(s).`,
          icon: '/pwa-192x192.png'
        });
      }
    }
  };

  // Modal para Pagar desde Alerta
  const [selectedPagoForPay, setSelectedPagoForPay] = useState<PagoProgramado | null>(null);
  const [payMedioId, setPayMedioId] = useState('');
  const [payMontoReal, setPayMontoReal] = useState('');

  const openPagarFromAlerta = (pagoId: string) => {
    const pago = pagosProgramados.find(p => p.id === pagoId);
    if (pago) {
      setSelectedPagoForPay(pago);
      setPayMedioId(medios[0]?.id || '');
      setPayMontoReal(String(pago.monto_esperado));
    }
  };

  const handleExecutePaymentFromDashboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPagoForPay || !payMedioId || Number(payMontoReal) <= 0) return;

    await pagarPagoProgramado(selectedPagoForPay.id, {
      medio_id: payMedioId,
      monto_real: Number(payMontoReal)
    });

    setSelectedPagoForPay(null);
  };

  // Filtrar hábitos programados para hoy (o todos los hábitos si ninguno tiene el día asignado)
  const habitosDeHoy = useMemo(() => {
    return habitos.map(h => {
      let dias: Record<string, boolean> = {};
      if (typeof h.dias_semana === 'string') {
        try { dias = JSON.parse(h.dias_semana); } catch {}
      } else if (typeof h.dias_semana === 'object') {
        dias = h.dias_semana as any;
      }
      
      const tocaHoy = dias[todayDayName] !== false;
      const proyecto = proyectos.find(p => p.id === h.id_proyecto);
      const tareas = todasTareas.filter(t => t.id_proyecto_habito === h.id).sort((a, b) => a.orden - b.orden);
      
      const regHabito = registroHabitos.find(r => {
        if (r.id_proyecto_habito !== h.id) return false;
        const rFecha = typeof r.fecha === 'string' ? r.fecha.slice(0, 10) : '';
        return rFecha === todayStr;
      });
      
      const tareasStatus = tareas.map(t => {
        const regTarea = regHabito 
          ? registroTareas.find(rt => rt.id_registro_habito === regHabito.id && rt.id_proyecto_tarea === t.id)
          : undefined;
        const completado = regTarea ? (regTarea.completado === 1 || (regTarea.completado as any) === true) : false;
        return { tarea: t, completado, regTarea };
      });

      const totalTareasCount = tareas.length;
      const completadasCount = tareasStatus.filter(ts => ts.completado).length;
      const completadoHoy = Boolean(
        regHabito && (regHabito.completado === 1 || (regHabito.completado as any) === true)
      ) || (totalTareasCount > 0 && completadasCount === totalTareasCount);

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

    let regHab = registroHabitos.find(r => {
      if (r.id_proyecto_habito !== habito.id) return false;
      const rFecha = typeof r.fecha === 'string' ? r.fecha.slice(0, 10) : '';
      return rFecha === todayStr;
    });
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

    const habitTareas = todasTareas.filter(t => t.id_proyecto_habito === habito.id);
    const updatedRTs = await localDB.registro_tareas.filter(rt => rt.id_registro_habito === regHabId).toArray();
    const doneMap = new Map(updatedRTs.map(rt => [rt.id_proyecto_tarea, rt.completado === 1 || (rt.completado as any) === true]));
    doneMap.set(tarea.id, newDone === 1);

    const allFinished = habitTareas.length > 0 && habitTareas.every(t => doneMap.get(t.id!) === true);

    const regHabCompletado = regHab ? (regHab.completado === 1 || (regHab.completado as any) === true) : false;

    if (allFinished && !regHabCompletado) {
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
    } else if (!allFinished && regHabCompletado) {
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

      {/* ── ALERTAS DE PAGO / NOTIFICACIONES ── */}
      {alertasPago.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '15px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              <Bell size={16} /> Alertas de Pago Pendientes ({alertasPago.length})
            </h3>
            <button
              className="action-btn"
              style={{ fontSize: '12px', padding: '4px 10px' }}
              onClick={triggerNotificationPrompt}
            >
              🔔 Activar Notificaciones PWA
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {alertasPago.map(a => {
              const pago = pagosProgramados.find(p => p.id === a.pago_programado_id);
              const egreso = pago ? egresosFijos.find(ef => ef.id === pago.egreso_fijo_id) : null;

              return (
                <div key={a.id} className="alerta-box-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                    <AlertCircle size={20} style={{ color: '#f59e0b', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                        {a.mensaje}
                      </div>
                      {egreso && (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Concepto: <strong>{egreso.razon}</strong> • Monto: <strong>S/ {pago?.monto_esperado.toFixed(2)}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {pago && pago.estado !== 'pagado' && (
                      <button
                        className="btn-primary"
                        style={{ padding: '6px 12px', fontSize: '12px', background: '#f59e0b', color: '#000', borderColor: '#f59e0b' }}
                        onClick={() => openPagarFromAlerta(pago.id)}
                      >
                        Pagar
                      </button>
                    )}
                    <button
                      className="btn-icon"
                      title="Marcar como leída"
                      style={{ padding: '6px' }}
                      onClick={() => marcarAlertaLeida(a.id, true)}
                    >
                      <CheckCheck size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── MÉTRICAS PRINCIPALES ── */}
      <section className="stats-grid">
        {isInitialSyncing && totalProyectos === 0 && totalTareas === 0 ? (
          <>
            {[1, 2, 3, 4, 5].map(idx => (
              <div key={idx} className="glass-card skeleton-stat-card">
                <div className="skeleton-box" style={{ width: '60px', height: '32px' }} />
                <div className="skeleton-box" style={{ width: '120px', height: '14px' }} />
              </div>
            ))}
          </>
        ) : (
          <>
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
              <span className="stat-number" style={{ color: '#ef4444' }}>{puntosHoy.totalGastados}</span>
              <span className="stat-label">Puntos Gastados Hoy</span>
            </div>
            <div className="glass-card stat-card">
              <span className="stat-number" style={{ color: 'var(--accent-primary)' }}>
                S/ {saldoTotalFinanzas.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="stat-label">Saldo Total en Cuentas</span>
            </div>
          </>
        )}
      </section>

      {/* ── SECCIÓN FINANZAS (SALDOS & RESUMEN DE MOVIMIENTOS) ── */}
      <section className="finanzas-dashboard-section">
        {/* Fila de Saldos por Medio */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Wallet size={18} style={{ color: 'var(--accent-primary)' }} /> Saldo por Cuenta / Medio
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{medios.length} cuentas registradas</span>
          </div>

          <div className="saldos-scroll-container">
            {isInitialSyncing && medios.length === 0 ? (
              [1, 2, 3].map(idx => (
                <div key={idx} className="saldo-card-item skeleton-box" style={{ height: '78px', minWidth: '170px' }} />
              ))
            ) : medios.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>No hay cuentas registradas aún. Ve a <strong>Finanzas</strong> para agregar cuentas.</p>
            ) : (
              medios.map(m => (
                <div key={m.id} className="saldo-card-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
                    {m.tipo_medio === 'efectivo' ? <Banknote size={14} /> : <CreditCard size={14} />}
                    <span style={{ fontWeight: 500, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>{m.medio}</span>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)' }}>
                    S/ {(m.saldo_actual || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                    {m.banco || m.tipo_medio.replace('_', ' ')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Resumen de Movimientos (Hoy / Semana / Mes) */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
              Resumen de Ingresos & Egresos
            </h3>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['hoy', 'semana', 'mes'] as const).map(p => (
                <button
                  key={p}
                  className={`timeframe-pill-btn ${periodoFinanzas === p ? 'active' : ''}`}
                  onClick={() => setPeriodoFinanzas(p)}
                >
                  {p === 'hoy' ? 'Hoy' : p === 'semana' ? 'Esta Semana' : 'Este Mes'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.08)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <span style={{ fontSize: '12px', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Wallet size={14} /> Saldo Total Disponible
              </span>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#60a5fa', marginTop: '4px' }}>
                S/ {medios.reduce((sum, m) => sum + (m.saldo_actual || 0), 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <span style={{ fontSize: '12px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ArrowDownRight size={14} /> Total Ingresos ({periodoFinanzas})
              </span>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10b981', marginTop: '4px' }}>
                +S/ {totalIngresosPeriodo.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <span style={{ fontSize: '12px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ArrowUpRight size={14} /> Total Egresos ({periodoFinanzas})
              </span>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444', marginTop: '4px' }}>
                -S/ {totalEgresosPeriodo.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Balance Neto ({periodoFinanzas})</span>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: totalIngresosPeriodo - totalEgresosPeriodo >= 0 ? '#10b981' : '#ef4444', marginTop: '4px' }}>
                S/ {(totalIngresosPeriodo - totalEgresosPeriodo).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Desgloses por Categoría y Medio */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div>
              <h4 style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>Egresos por Categoría</h4>
              {egresosPorCategoria.length === 0 ? (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin egresos en este periodo.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {egresosPorCategoria.map((cat, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: 'var(--text-main)' }}>{cat.nombre}</span>
                      <strong style={{ color: '#ef4444' }}>S/ {cat.total.toFixed(2)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>Egresos por Medio de Pago</h4>
              {egresosPorMedio.length === 0 ? (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin egresos en este periodo.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {egresosPorMedio.map((med, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: 'var(--text-main)' }}>{med.nombre}</span>
                      <strong style={{ color: '#ef4444' }}>S/ {med.total.toFixed(2)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Seguimiento de Presupuestos */}
        {presupuestos.length > 0 && (
          <div className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PieChart size={18} style={{ color: 'var(--accent-primary)' }} /> Seguimiento de Presupuestos
              </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              {presupuestos.map(p => {
                const cat = categoriasFinanzas.find(c => c.id === p.categoria_id);
                const currMonthStr = new Date().toISOString().slice(0, 7);
                const gastado = movimientos
                  .filter(m => m.tipo === 'E' && m.categoria_id === p.categoria_id && (m.fecha_movimiento || '').startsWith(currMonthStr))
                  .reduce((sum, m) => sum + m.monto, 0);

                const porcentaje = Math.min(Math.round((gastado / p.monto_limite) * 100), 100);
                let barColor = '#10b981';
                if (porcentaje > 90) barColor = '#ef4444';
                else if (porcentaje > 70) barColor = '#f59e0b';

                return (
                  <div key={p.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-main)' }}>{p.nombre}</span>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: barColor }}>{porcentaje}%</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {cat ? cat.categoria : 'General'} • S/ {gastado.toFixed(2)} de S/ {p.monto_limite.toFixed(2)}
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden', margin: '8px 0 4px 0' }}>
                      <div style={{ width: `${porcentaje}%`, height: '100%', background: barColor, borderRadius: '4px', transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>
                      Restante: S/ {Math.max(p.monto_limite - gastado, 0).toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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

        {isInitialSyncing && habitos.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[1, 2].map(idx => (
              <div key={idx} className="skeleton-habit-card">
                <div className="skeleton-box" style={{ width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="skeleton-box" style={{ width: '45%', height: '18px' }} />
                  <div className="skeleton-box" style={{ width: '25%', height: '12px' }} />
                </div>
              </div>
            ))}
          </div>
        ) : habitosDeHoy.length === 0 ? (
          <div className="glass-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ margin: 0 }}>No hay hábitos configurados para hoy. Ve a tus <strong>Áreas y Proyectos</strong> para activar hábitos y mini-tareas.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {habitosDeHoy.map(({ habito, proyecto, tareas, totalTareasCount, completadasCount, regHabito, completadoHoy }) => {
              const isExpanded = !!expandedHabits[habito.id!];
              const streak = Math.max(habito.record_streak || 0, regHabito?.streak_actual || 0, completadoHoy ? 1 : 0);

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
                                className={`streak-dot ${streak >= dotIdx ? 'active' : ''}`}
                              />
                            ))}
                          </div>
                          <span style={{ fontWeight: 600, color: streak > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
                            🔥 {streak} {streak === 1 ? 'día' : 'días'} streak
                          </span>
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
                                {idx < tareas.length - 1 && (
                                  <div className={`timeline-connector ${completado && isNextDone ? 'completed' : ''}`} />
                                )}

                                <div className="timeline-time">
                                  {tarea.tiempo_estimado_minutos} min
                                </div>

                                <div
                                  className={`timeline-node ${completado ? 'done' : ''}`}
                                  onClick={() => handleToggleTask(habito, tarea, completado)}
                                >
                                  {completado && <Check size={13} />}
                                </div>

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

      {/* ── MODAL: PAGAR CUOTA DESDE ALERTAS ── */}
      {selectedPagoForPay && (
        <div className="modal-overlay" onClick={() => setSelectedPagoForPay(null)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Registrar Pago de Cuota</h2>
              <button className="action-btn" onClick={() => setSelectedPagoForPay(null)}><X size={22} /></button>
            </div>
            <form onSubmit={handleExecutePaymentFromDashboard} className="modal-body">
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                Fecha programada: <strong>{selectedPagoForPay.fecha_programada}</strong>
              </p>

              <div className="form-group">
                <label>Monto Real Pagado (S/) *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  required
                  value={payMontoReal}
                  onChange={e => setPayMontoReal(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Cuenta / Medio con que pagaste *</label>
                <select
                  className="glass-select"
                  required
                  value={payMedioId}
                  onChange={e => setPayMedioId(e.target.value)}
                >
                  {medios.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.medio} (Saldo: S/ {(m.saldo_actual || 0).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-footer">
                <button type="button" className="action-btn" onClick={() => setSelectedPagoForPay(null)}>Cancelar</button>
                <button type="submit" className="btn-primary">Confirmar Pago</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}