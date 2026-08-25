import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, type Proyecto, type Metrica, type ProyectoMetrica, type ProyectoHabito } from '../db/localDb';
import { 
  getArea, getProyectos, createProyecto, updateProyecto,
  getMetricas, createMetrica, updateMetrica,
  getProyectoMetricas, createProyectoMetrica, updateProyectoMetrica,
  getProyectoHabitos, createProyectoHabito, updateProyectoHabito,
  getProyectoTareas, createProyectoTarea, updateProyectoTarea, deleteProyectoTarea
} from '../services/api';
import { 
  ArrowLeft, Folder, BarChart2, Plus, Edit2, Trash2, X, 
  Calendar, Target, Link as LinkIcon, CheckSquare, Flame, Clock, ListChecks
} from 'lucide-react';
import './DetalleAreaView.css';

export function DetalleAreaView() {
  const { areaId } = useParams<{ areaId: string }>();
  const navigate = useNavigate();
  const idArea = Number(areaId);

  const [activeTab, setActiveTab] = useState<'proyectos' | 'metricas'>('proyectos');

  // Datos Locales Reactivos
  const area = useLiveQuery(() => localDB.areas.get(idArea), [idArea]);
  const proyectos = useLiveQuery(() => localDB.proyectos.filter(p => p.id_area === idArea && p.estado === 1).toArray(), [idArea]) || [];
  const metricas = useLiveQuery(() => localDB.metricas.filter(m => m.id_area === idArea && m.estado === 1).toArray(), [idArea]) || [];
  const pmRelations = useLiveQuery(() => localDB.proyecto_metricas.filter(pm => pm.activo === 1).toArray(), []) || [];
  const habitos = useLiveQuery(() => localDB.proyecto_habitos.filter(h => h.activo === 1).toArray(), []) || [];
  const todasTareas = useLiveQuery(() => localDB.proyecto_tareas.filter(t => t.activo === 1).toArray(), []) || [];

  // Refrescar DB
  useEffect(() => {
    if (navigator.onLine && !isNaN(idArea)) {
      getArea(idArea).catch(console.error);
      getProyectos().catch(console.error);
      getMetricas().catch(console.error);
      getProyectoMetricas().catch(console.error);
      getProyectoHabitos().catch(console.error);
      getProyectoTareas().catch(console.error);
    }
  }, [idArea]);

  // --- Estados Modal Proyectos ---
  const [isProjModalOpen, setIsProjModalOpen] = useState(false);
  const [selectedProj, setSelectedProj] = useState<Proyecto | null>(null);
  const initialProjForm = { nombre: '', descripcion: '', meta: '', fecha_inicio: '', fecha_fin_planeado: '', fecha_fin_real: '' };
  const [projForm, setProjForm] = useState(initialProjForm);

  // --- Estados Modal Métricas ---
  const [isMetModalOpen, setIsMetModalOpen] = useState(false);
  const [selectedMet, setSelectedMet] = useState<Metrica | null>(null);
  const initialMetForm = { nombre: '', descripcion: '', points: 10 };
  const [metForm, setMetForm] = useState(initialMetForm);
  
  // Constructor Visual Schema
  const [schemaFields, setSchemaFields] = useState<{key: string, type: string}[]>([{ key: 'valor', type: 'number' }]);
  const [resultadosFields, setResultadosFields] = useState<{target_attribute: string, condition: string, value: string, points_change: string}[]>([]);

  // --- Estados Modal Relacionar (Proyecto <-> Métrica) ---
  const [isRelModalOpen, setIsRelModalOpen] = useState(false);
  const [selectedProjForRel, setSelectedProjForRel] = useState<number | null>(null);
  const [selectedRelForEdit, setSelectedRelForEdit] = useState<ProyectoMetrica | null>(null);
  const initialRelForm = { id_metrica: '', frequency_type: 'mensual', interval: 1 };
  const [relForm, setRelForm] = useState(initialRelForm);
  // Campos config según frequency_type
  const [relConfigMensual, setRelConfigMensual] = useState({ times_per_period: 1, days_of_month: '' });
  const [relConfigSemanal, setRelConfigSemanal] = useState({ days_of_week: '1,3,5' });
  const [relConfigDiario, setRelConfigDiario] = useState({ time: '' });

  // --- Estados Modal Hábitos & Mini-Tareas ---
  const [isHabitoModalOpen, setIsHabitoModalOpen] = useState(false);
  const [selectedProjForHabito, setSelectedProjForHabito] = useState<Proyecto | null>(null);
  const [existingHabito, setExistingHabito] = useState<ProyectoHabito | null>(null);
  const [habitoDias, setHabitoDias] = useState<Record<string, boolean>>({
    lunes: true, martes: true, miercoles: true, jueves: true, viernes: true, sabado: false, domingo: false
  });
  const [horaObjetivo, setHoraObjetivo] = useState('');
  const [pointsPorCompletar, setPointsPorCompletar] = useState(10);
  const [habitoTareas, setHabitoTareas] = useState<{ id?: number; nombre: string; descripcion?: string; tiempo_estimado_minutos: number; orden: number }[]>([]);
  const [newTareaForm, setNewTareaForm] = useState({ nombre: '', descripcion: '', tiempo_estimado_minutos: 15 });

  // -----------------------------------------
  // HANDLERS PROYECTOS
  // -----------------------------------------
  const openProjModal = (p?: Proyecto) => {
    if (p) {
      setSelectedProj(p);
      setProjForm({
        nombre: p.nombre, descripcion: p.descripcion, meta: p.meta,
        fecha_inicio: p.fecha_inicio.slice(0, 10),
        fecha_fin_planeado: p.fecha_fin_planeado.slice(0, 10),
        fecha_fin_real: p.fecha_fin_real ? p.fecha_fin_real.slice(0, 10) : ''
      });
    } else {
      setSelectedProj(null);
      setProjForm(initialProjForm);
    }
    setIsProjModalOpen(true);
  };

  const saveProj = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      id_area: idArea,
      ...projForm,
      fecha_fin_real: projForm.fecha_fin_real ? projForm.fecha_fin_real : null
    };

    if (selectedProj?.id) {
      await updateProyecto(selectedProj.id, payload);
    } else {
      await createProyecto(payload);
    }
    setIsProjModalOpen(false);
  };

  const deleteProj = async (p: Proyecto) => {
    if (confirm(`¿Eliminar proyecto ${p.nombre}?`)) {
      await updateProyecto(p.id!, { ...p, estado: 0 } as any);
    }
  };

  // -----------------------------------------
  // HANDLERS MÉTRICAS
  // -----------------------------------------
  const openMetModal = (m?: Metrica) => {
    if (m) {
      setSelectedMet(m);
      setMetForm({ nombre: m.nombre, descripcion: m.descripcion, points: m.points });
      try {
        const schema = typeof m.schema_esperado === 'string' ? JSON.parse(m.schema_esperado) : m.schema_esperado;
        const fields = Object.keys(schema).map(k => ({ key: k, type: schema[k] }));
        setSchemaFields(fields.length ? fields : [{ key: 'valor', type: 'number' }]);
      } catch { setSchemaFields([{ key: 'valor', type: 'number' }]); }
      
      try {
        if (m.resultados_esperado) {
          const res = typeof m.resultados_esperado === 'string' ? JSON.parse(m.resultados_esperado) : m.resultados_esperado;
          if (Array.isArray(res)) {
            setResultadosFields(res);
          }
        } else {
          setResultadosFields([]);
        }
      } catch { setResultadosFields([]); }
    } else {
      setSelectedMet(null);
      setMetForm(initialMetForm);
      setSchemaFields([{ key: 'valor', type: 'number' }]);
      setResultadosFields([]);
    }
    setIsMetModalOpen(true);
  };

  const saveMet = async (e: React.FormEvent) => {
    e.preventDefault();
    const schemaObj: Record<string, string> = {};
    schemaFields.forEach(f => { if(f.key) schemaObj[f.key] = f.type; });

    const payload = {
      id_area: idArea,
      ...metForm,
      schema_esperado: schemaObj,
      resultados_esperado: resultadosFields.length ? resultadosFields : null
    };

    if (selectedMet?.id) {
      await updateMetrica(selectedMet.id, payload);
    } else {
      await createMetrica(payload);
    }
    setIsMetModalOpen(false);
  };

  const deleteMet = async (m: Metrica) => {
    if (confirm(`¿Eliminar métrica ${m.nombre}?`)) {
      await updateMetrica(m.id!, { ...m, estado: 0 } as any);
    }
  };

  // -----------------------------------------
  // HANDLERS RELACION (Proyecto_Metrica)
  // -----------------------------------------
  const openRelModal = (idProyecto: number, pm?: ProyectoMetrica) => {
    setSelectedProjForRel(idProyecto);
    if (pm) {
      setSelectedRelForEdit(pm);
      try {
        const parsed = typeof pm.config_programacion === 'string' ? JSON.parse(pm.config_programacion) : pm.config_programacion;
        setRelForm({
          id_metrica: pm.id_metrica.toString(),
          frequency_type: parsed.frequency_type || 'mensual',
          interval: parsed.interval || 1
        });
        const c = parsed.config || {};
        setRelConfigMensual({ 
          times_per_period: c.times_per_period || 1, 
          days_of_month: c.days_of_month ? c.days_of_month.join(',') : '' 
        });
        setRelConfigSemanal({ 
          days_of_week: c.days_of_week ? c.days_of_week.join(',') : '' 
        });
        setRelConfigDiario({ 
          time: c.time || '' 
        });
      } catch {
        setRelForm({ id_metrica: pm.id_metrica.toString(), frequency_type: 'mensual', interval: 1 });
      }
    } else {
      setSelectedRelForEdit(null);
      setRelForm(initialRelForm);
      setRelConfigMensual({ times_per_period: 1, days_of_month: '' });
      setRelConfigSemanal({ days_of_week: '1,3,5' });
      setRelConfigDiario({ time: '' });
    }
    setIsRelModalOpen(true);
  };

  const saveRel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjForRel || !relForm.id_metrica) return;

    let configDetails: any = {};
    if (relForm.frequency_type === 'mensual') {
      const days = relConfigMensual.days_of_month.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      configDetails = { times_per_period: relConfigMensual.times_per_period, days_of_month: days.length ? days : null, specific_days: null };
    } else if (relForm.frequency_type === 'semanal') {
      const days = relConfigSemanal.days_of_week.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      configDetails = { days_of_week: days };
    } else if (relForm.frequency_type === 'diario') {
      configDetails = relConfigDiario.time ? { time: relConfigDiario.time } : {};
    } else {
      configDetails = {};
    }

    const configJSON = {
      frequency_type: relForm.frequency_type,
      interval: relForm.interval,
      config: configDetails
    };

    const payload = {
      id_proyecto: selectedProjForRel,
      id_metrica: Number(relForm.id_metrica),
      config_programacion: configJSON
    };

    if (selectedRelForEdit?.id) {
      await updateProyectoMetrica(selectedRelForEdit.id, payload);
    } else {
      await createProyectoMetrica(payload);
    }
    setIsRelModalOpen(false);
  };

  // -----------------------------------------
  // HANDLERS HÁBITOS & MINI-TAREAS
  // -----------------------------------------
  const openHabitoModal = (p: Proyecto) => {
    setSelectedProjForHabito(p);
    const hab = habitos.find(h => h.id_proyecto === p.id);
    if (hab) {
      setExistingHabito(hab);
      let diasObj: Record<string, boolean> = {
        lunes: true, martes: true, miercoles: true, jueves: true, viernes: true, sabado: false, domingo: false
      };
      if (typeof hab.dias_semana === 'string') {
        try { diasObj = JSON.parse(hab.dias_semana); } catch {}
      } else if (typeof hab.dias_semana === 'object') {
        diasObj = { ...hab.dias_semana };
      }
      setHabitoDias(diasObj);
      setHoraObjetivo(hab.hora_objetivo ? hab.hora_objetivo.slice(0, 5) : '');
      setPointsPorCompletar(hab.points_por_completar || 10);

      const tareas = todasTareas.filter(t => t.id_proyecto_habito === hab.id).sort((a, b) => a.orden - b.orden);
      setHabitoTareas(tareas.map(t => ({
        id: t.id,
        nombre: t.nombre,
        descripcion: t.descripcion,
        tiempo_estimado_minutos: t.tiempo_estimado_minutos,
        orden: t.orden
      })));
    } else {
      setExistingHabito(null);
      setHabitoDias({ lunes: true, martes: true, miercoles: true, jueves: true, viernes: true, sabado: false, domingo: false });
      setHoraObjetivo('');
      setPointsPorCompletar(10);
      setHabitoTareas([]);
    }
    setNewTareaForm({ nombre: '', descripcion: '', tiempo_estimado_minutos: 15 });
    setIsHabitoModalOpen(true);
  };

  const toggleDia = (dia: string) => {
    setHabitoDias(prev => ({ ...prev, [dia]: !prev[dia] }));
  };

  const handleAddTarea = () => {
    if (!newTareaForm.nombre.trim()) return;
    setHabitoTareas(prev => [
      ...prev,
      {
        nombre: newTareaForm.nombre.trim(),
        descripcion: newTareaForm.descripcion.trim(),
        tiempo_estimado_minutos: Number(newTareaForm.tiempo_estimado_minutos) || 15,
        orden: prev.length + 1
      }
    ]);
    setNewTareaForm({ nombre: '', descripcion: '', tiempo_estimado_minutos: 15 });
  };

  const handleRemoveTarea = async (idx: number, tId?: number) => {
    if (tId) {
      await deleteProyectoTarea(tId);
    }
    setHabitoTareas(prev => prev.filter((_, i) => i !== idx).map((t, i) => ({ ...t, orden: i + 1 })));
  };

  const handleSaveHabito = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjForHabito?.id) return;

    let habitoId = existingHabito?.id;
    const habPayload = {
      id_proyecto: selectedProjForHabito.id,
      dias_semana: habitoDias,
      hora_objetivo: horaObjetivo || null,
      points_por_completar: Number(pointsPorCompletar) || 10,
      activo: 1
    };

    if (existingHabito?.id) {
      await updateProyectoHabito(existingHabito.id, habPayload);
    } else {
      habitoId = Number(await createProyectoHabito(habPayload));
    }

    // Guardar / actualizar mini-tareas
    if (habitoId) {
      for (const t of habitoTareas) {
        if (t.id) {
          await updateProyectoTarea(t.id, {
            nombre: t.nombre,
            descripcion: t.descripcion,
            tiempo_estimado_minutos: t.tiempo_estimado_minutos,
            orden: t.orden,
            activo: 1
          });
        } else {
          await createProyectoTarea({
            id_proyecto_habito: habitoId,
            nombre: t.nombre,
            descripcion: t.descripcion,
            tiempo_estimado_minutos: t.tiempo_estimado_minutos,
            orden: t.orden
          });
        }
      }
    }

    setIsHabitoModalOpen(false);
  };

  if (!area && isNaN(idArea)) return <div>Cargando Área...</div>;

  return (
    <div className="detalle-area-container">
      <button className="back-button" onClick={() => navigate('/proyectos')}>
        <ArrowLeft size={16} /> Volver a Áreas
      </button>

      <div className="detalle-header">
        <h1>{area?.nombre || 'Cargando...'}</h1>
        <p>{area?.descripcion}</p>
      </div>

      <div className="tabs-container">
        <button 
          className={`tab-button ${activeTab === 'proyectos' ? 'active' : ''}`}
          onClick={() => setActiveTab('proyectos')}
        >
          <Folder size={18} /> Proyectos
        </button>
        <button 
          className={`tab-button ${activeTab === 'metricas' ? 'active' : ''}`}
          onClick={() => setActiveTab('metricas')}
        >
          <BarChart2 size={18} /> Métricas
        </button>
      </div>

      {activeTab === 'proyectos' && (
        <section>
          <div className="section-header">
            <h2>Proyectos del Área</h2>
            <button className="btn-primary" onClick={() => openProjModal()}>
              <Plus size={18} /> Nuevo Proyecto
            </button>
          </div>
          <div className="items-grid">
            {proyectos.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No hay proyectos en esta área.</p>}
            {proyectos.map(p => {
              const rels = pmRelations.filter(rel => rel.id_proyecto === p.id);
              const hab = habitos.find(h => h.id_proyecto === p.id);
              const tareasCount = hab ? todasTareas.filter(t => t.id_proyecto_habito === hab.id).length : 0;

              return (
                <div key={p.id} className="item-card">
                  <div className="item-header">
                    <h3 className="item-title">{p.nombre}</h3>
                    <span title={p._sincronizado === 1 ? 'Sincronizado' : 'Pendiente'}>
                      {p._sincronizado === 1 ? '☁️' : '⏳'}
                    </span>
                  </div>
                  <p className="item-desc">{p.descripcion}</p>
                  
                  <div className="item-meta">
                    <span><Target size={14}/> {p.meta}</span>
                    <span><Calendar size={14}/> Inicio: {new Date(p.fecha_inicio).toLocaleDateString()}</span>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>Tracking Diario / Hábito:</div>
                    {hab ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className="badge" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckSquare size={13} /> {tareasCount} {tareasCount === 1 ? 'paso' : 'pasos'} • {hab.points_por_completar} pts
                        </span>
                        <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Flame size={13} /> {hab.record_streak || 0} streak
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#888' }}>Sin hábito configurado</span>
                    )}
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>Métricas Asignadas:</div>
                    {rels.length === 0 ? <span style={{ fontSize: '12px', color: '#888' }}>Ninguna</span> : null}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {rels.map(rel => {
                        const m = metricas.find(mx => mx.id === rel.id_metrica);
                        return m ? (
                          <span key={rel.id} className="badge" style={{ background: 'var(--accent)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {m.nombre}
                            <span title="Editar Programación" style={{ display: 'flex' }} onClick={(e) => { e.stopPropagation(); openRelModal(p.id!, rel); }}>
                              <Edit2 size={12} style={{ cursor: 'pointer', opacity: 0.8 }} />
                            </span>
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>

                  <div className="item-footer">
                    <button className="btn-icon" onClick={() => openHabitoModal(p)} title="Configurar Hábito / Mini-tareas" style={{ color: hab ? '#10b981' : 'inherit' }}>
                      <CheckSquare size={16} />
                    </button>
                    <button className="btn-icon" onClick={() => openRelModal(p.id!)} title="Asignar Métrica">
                      <LinkIcon size={16} />
                    </button>
                    <button className="btn-icon" onClick={() => openProjModal(p)} title="Editar">
                      <Edit2 size={16} />
                    </button>
                    <button className="btn-icon danger" onClick={() => deleteProj(p)} title="Eliminar">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === 'metricas' && (
        <section>
          <div className="section-header">
            <h2>Métricas de Referencia</h2>
            <button className="btn-primary" onClick={() => openMetModal()}>
              <Plus size={18} /> Nueva Métrica
            </button>
          </div>
          <div className="items-grid">
            {metricas.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No hay métricas en esta área.</p>}
            {metricas.map(m => (
              <div key={m.id} className="item-card">
                <div className="item-header">
                  <h3 className="item-title">{m.nombre}</h3>
                  <span title={m._sincronizado === 1 ? 'Sincronizado' : 'Pendiente'}>
                    {m._sincronizado === 1 ? '☁️' : '⏳'}
                  </span>
                </div>
                <p className="item-desc">{m.descripcion}</p>
                <div className="item-meta">
                  <span>Puntos: {m.points}</span>
                </div>
                <div className="json-builder" style={{ fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                  {typeof m.schema_esperado === 'string' ? m.schema_esperado : JSON.stringify(m.schema_esperado)}
                </div>
                <div className="item-footer">
                  <button className="btn-icon" onClick={() => openMetModal(m)} title="Editar">
                    <Edit2 size={16} />
                  </button>
                  <button className="btn-icon danger" onClick={() => deleteMet(m)} title="Eliminar">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --- MODALS --- */}
      
      {/* Modal Proyecto */}
      {isProjModalOpen && (
        <div className="modal-overlay" onClick={() => setIsProjModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedProj ? 'Editar Proyecto' : 'Nuevo Proyecto'}</h2>
              <button className="action-btn" onClick={() => setIsProjModalOpen(false)}><X size={24} /></button>
            </div>
            <form onSubmit={saveProj} className="modal-body">
              <div className="form-group">
                <label>Nombre *</label>
                <input type="text" className="form-input" required value={projForm.nombre} onChange={e => setProjForm({...projForm, nombre: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Meta *</label>
                <input type="text" className="form-input" required value={projForm.meta} onChange={e => setProjForm({...projForm, meta: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <textarea className="form-textarea" rows={2} value={projForm.descripcion} onChange={e => setProjForm({...projForm, descripcion: e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Fecha Inicio *</label>
                  <input type="date" className="form-input" required value={projForm.fecha_inicio} onChange={e => setProjForm({...projForm, fecha_inicio: e.target.value})} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Fin Planeado *</label>
                  <input type="date" className="form-input" required value={projForm.fecha_fin_planeado} onChange={e => setProjForm({...projForm, fecha_fin_planeado: e.target.value})} />
                </div>
              </div>
              {selectedProj && (
                <div className="form-group">
                  <label>Fecha Fin Real (Solo al finalizar)</label>
                  <input type="date" className="form-input" value={projForm.fecha_fin_real} onChange={e => setProjForm({...projForm, fecha_fin_real: e.target.value})} />
                </div>
              )}
              <div className="modal-footer">
                <button type="button" className="action-btn" onClick={() => setIsProjModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Métrica */}
      {isMetModalOpen && (
        <div className="modal-overlay" onClick={() => setIsMetModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedMet ? 'Editar Métrica' : 'Nueva Métrica'}</h2>
              <button className="action-btn" onClick={() => setIsMetModalOpen(false)}><X size={24} /></button>
            </div>
            <form onSubmit={saveMet} className="modal-body">
              <div className="form-group">
                <label>Nombre *</label>
                <input type="text" className="form-input" required value={metForm.nombre} onChange={e => setMetForm({...metForm, nombre: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <input type="text" className="form-input" value={metForm.descripcion} onChange={e => setMetForm({...metForm, descripcion: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Puntos de recompensa</label>
                <input type="number" className="form-input" required value={metForm.points} onChange={e => setMetForm({...metForm, points: Number(e.target.value)})} />
              </div>
              
              <div className="form-group">
                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                  Esquema Esperado (Atributos)
                  <button type="button" style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px' }}
                    onClick={() => setSchemaFields([...schemaFields, {key: '', type: 'number'}])}
                  >+ Añadir Atributo</button>
                </label>
                <div className="json-builder">
                  {schemaFields.map((field, idx) => (
                    <div key={idx} className="builder-row">
                      <input type="text" className="form-input" placeholder="Nombre (ej. peso)" value={field.key} 
                        onChange={e => { const nv = [...schemaFields]; nv[idx].key = e.target.value; setSchemaFields(nv); }} 
                      />
                      <select className="glass-select" value={field.type}
                        onChange={e => { const nv = [...schemaFields]; nv[idx].type = e.target.value; setSchemaFields(nv); }}
                      >
                        <option value="number">Número</option>
                        <option value="string">Texto</option>
                        <option value="boolean">Booleano</option>
                      </select>
                      <button type="button" className="btn-icon danger" onClick={() => {
                        const nv = schemaFields.filter((_, i) => i !== idx);
                        setSchemaFields(nv);
                      }}><X size={14}/></button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                  Resultados Esperados (Condiciones)
                  <button type="button" style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px' }}
                    onClick={() => setResultadosFields([...resultadosFields, {target_attribute: schemaFields[0]?.key || '', condition: '>=', value: '', points_change: ''}])}
                  >+ Añadir Condición</button>
                </label>
                <div className="json-builder">
                  {resultadosFields.length === 0 && <span style={{fontSize: '13px', color: 'var(--text-muted)'}}>Sin condiciones extra (puntos fijos).</span>}
                  {resultadosFields.map((field, idx) => (
                    <div key={idx} className="builder-row">
                      <select className="glass-select" value={field.target_attribute || ''}
                        onChange={e => { const nv = [...resultadosFields]; nv[idx].target_attribute = e.target.value; setResultadosFields(nv); }}
                      >
                        {schemaFields.map(sf => <option key={sf.key} value={sf.key}>{sf.key || 'Sin nombre'}</option>)}
                      </select>
                      <select className="glass-select" value={field.condition}
                        onChange={e => { const nv = [...resultadosFields]; nv[idx].condition = e.target.value; setResultadosFields(nv); }}
                      >
                        <option value=">=">Mayor o igual ({'>='})</option>
                        <option value="<=">Menor o igual ({'<='})</option>
                        <option value="==">Igual (==)</option>
                        <option value=">">Mayor que ({'>'})</option>
                        <option value="<">Menor que ({'<'})</option>
                      </select>
                      <input type="text" className="form-input" placeholder="Valor objetivo (ej. 100)" value={field.value} 
                        onChange={e => { const nv = [...resultadosFields]; nv[idx].value = e.target.value; setResultadosFields(nv); }} 
                      />
                      <input type="text" className="form-input" placeholder="Puntos extra (ej. +5, x2)" value={field.points_change} 
                        onChange={e => { const nv = [...resultadosFields]; nv[idx].points_change = e.target.value; setResultadosFields(nv); }} 
                      />
                      <button type="button" className="btn-icon danger" onClick={() => {
                        const nv = resultadosFields.filter((_, i) => i !== idx);
                        setResultadosFields(nv);
                      }}><X size={14}/></button>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="modal-footer">
                <button type="button" className="action-btn" onClick={() => setIsMetModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Relacionar Proyecto y Métrica */}
      {isRelModalOpen && (
        <div className="modal-overlay" onClick={() => setIsRelModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Asignar Métrica a Proyecto</h2>
              <button className="action-btn" onClick={() => setIsRelModalOpen(false)}><X size={24} /></button>
            </div>
            <form onSubmit={saveRel} className="modal-body">
              <div className="form-group">
                <label>Selecciona la Métrica *</label>
                <select className="glass-select" required value={relForm.id_metrica} onChange={e => setRelForm({...relForm, id_metrica: e.target.value})}>
                  <option value="" disabled>Elegir métrica...</option>
                  {metricas.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>Tipo de Frecuencia *</label>
                <select className="glass-select" value={relForm.frequency_type} onChange={e => setRelForm({...relForm, frequency_type: e.target.value})}>
                  <option value="diario">Diario</option>
                  <option value="semanal">Semanal</option>
                  <option value="mensual">Mensual</option>
                  <option value="anual">Anual</option>
                </select>
              </div>

              <div className="form-group">
                <label>Intervalo (cada X periodos) *</label>
                <input type="number" min="1" className="form-input" required value={relForm.interval} onChange={e => setRelForm({...relForm, interval: Number(e.target.value)})} />
              </div>

              {/* Controles de Configuración según Frecuencia */}
              {relForm.frequency_type === 'mensual' && (
                <div className="json-builder">
                  <div className="form-group">
                    <label>Veces por periodo (mes)</label>
                    <input type="number" className="form-input" value={relConfigMensual.times_per_period} onChange={e => setRelConfigMensual({...relConfigMensual, times_per_period: Number(e.target.value)})} />
                  </div>
                  <div className="form-group">
                    <label>Días específicos del mes (ej. 5, 20)</label>
                    <input type="text" className="form-input" placeholder="Separados por comas" value={relConfigMensual.days_of_month} onChange={e => setRelConfigMensual({...relConfigMensual, days_of_month: e.target.value})} />
                  </div>
                </div>
              )}

              {relForm.frequency_type === 'semanal' && (
                <div className="json-builder">
                  <div className="form-group">
                    <label>Días de la semana (1=Lun, 7=Dom) (ej. 1,3,5)</label>
                    <input type="text" className="form-input" placeholder="Separados por comas" value={relConfigSemanal.days_of_week} onChange={e => setRelConfigSemanal({...relConfigSemanal, days_of_week: e.target.value})} />
                  </div>
                </div>
              )}

              {relForm.frequency_type === 'diario' && (
                <div className="json-builder">
                  <div className="form-group">
                    <label>Hora específica (opcional)</label>
                    <input type="time" className="form-input" value={relConfigDiario.time} onChange={e => setRelConfigDiario({...relConfigDiario, time: e.target.value})} />
                  </div>
                </div>
              )}

              <div className="modal-footer">
                <button type="button" className="action-btn" onClick={() => setIsRelModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Asignar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Configurar Hábito y Mini-tareas */}
      {isHabitoModalOpen && selectedProjForHabito && (
        <div className="modal-overlay" onClick={() => setIsHabitoModalOpen(false)}>
          <div className="glass-card modal-content" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '18px' }}>
                  <CheckSquare style={{ color: 'var(--accent-primary)' }} /> Hábito Diario / Programado
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
                  Proyecto: <strong>{selectedProjForHabito.nombre}</strong>
                </p>
              </div>
              <button className="action-btn" onClick={() => setIsHabitoModalOpen(false)}><X size={24} /></button>
            </div>

            <form onSubmit={handleSaveHabito} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', boxSizing: 'border-box' }}>
              {/* Días de la Semana */}
              <div className="form-group" style={{ width: '100%' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Días de Ejecución *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(42px, 1fr))', gap: '6px', width: '100%' }}>
                  {[
                    { key: 'lunes', label: 'Lun' },
                    { key: 'martes', label: 'Mar' },
                    { key: 'miercoles', label: 'Mié' },
                    { key: 'jueves', label: 'Jue' },
                    { key: 'viernes', label: 'Vie' },
                    { key: 'sabado', label: 'Sáb' },
                    { key: 'domingo', label: 'Dom' }
                  ].map(d => {
                    const active = !!habitoDias[d.key];
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => toggleDia(d.key)}
                        style={{
                          padding: '10px 4px',
                          borderRadius: '8px',
                          border: active ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)',
                          background: active ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                          color: active ? '#fff' : 'var(--text-muted)',
                          fontWeight: active ? 'bold' : 'normal',
                          fontSize: '13px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          textAlign: 'center'
                        }}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hora y Puntos */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', width: '100%' }}>
                <div className="form-group" style={{ width: '100%' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <Clock size={14} /> Hora Sugerida
                  </label>
                  <input
                    type="time"
                    className="form-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={horaObjetivo}
                    onChange={e => setHoraObjetivo(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ width: '100%' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <Flame size={14} style={{ color: '#f59e0b' }} /> Puntos al Completar *
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    required
                    value={pointsPorCompletar}
                    onChange={e => setPointsPorCompletar(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Mini Tareas / Pasos */}
              <div className="form-group" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, margin: 0 }}>
                    <ListChecks size={16} /> Mini-Tareas / Pasos ({habitoTareas.length})
                  </label>
                </div>

                {/* Lista de tareas existentes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', width: '100%' }}>
                  {habitoTareas.length === 0 && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic', margin: '4px 0' }}>
                      No has agregado mini-tareas aún. Agrega los pasos necesarios para completar este proyecto diariamente.
                    </p>
                  )}
                  {habitoTareas.map((t, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        gap: '8px',
                        width: '100%',
                        boxSizing: 'border-box'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                        <span style={{ 
                          width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', 
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', flexShrink: 0
                        }}>
                          {idx + 1}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 500, color: 'var(--text-main)', wordBreak: 'break-word', fontSize: '13px' }}>{t.nombre}</div>
                          {t.descripcion && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.descripcion}</div>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', fontSize: '11px', padding: '3px 6px', borderRadius: '6px' }}>
                          ⏱️ {t.tiempo_estimado_minutos}m
                        </span>
                        <button
                          type="button"
                          className="btn-icon danger"
                          onClick={() => handleRemoveTarea(idx, t.id)}
                          title="Eliminar paso"
                          style={{ padding: '4px' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Formulario para agregar nuevo paso */}
                <div style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px dashed rgba(255, 255, 255, 0.15)',
                  borderRadius: '10px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  width: '100%',
                  boxSizing: 'border-box'
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-primary)' }}>+ Agregar Mini-Tarea</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(80px, 100px)', gap: '8px', width: '100%' }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      placeholder="Título del paso *"
                      value={newTareaForm.nombre}
                      onChange={e => setNewTareaForm({ ...newTareaForm, nombre: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTarea(); } }}
                    />
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      placeholder="Minutos"
                      value={newTareaForm.tiempo_estimado_minutos}
                      onChange={e => setNewTareaForm({ ...newTareaForm, tiempo_estimado_minutos: Number(e.target.value) })}
                    />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', width: '100%' }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ flex: '1 1 180px', width: '100%', boxSizing: 'border-box' }}
                      placeholder="Descripción u objetivo (opcional)"
                      value={newTareaForm.descripcion}
                      onChange={e => setNewTareaForm({ ...newTareaForm, descripcion: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTarea(); } }}
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleAddTarea}
                      style={{ whiteSpace: 'nowrap', padding: '8px 14px', fontSize: '13px', flex: '1 1 auto', justifyContent: 'center' }}
                    >
                      <Plus size={15} /> Agregar
                    </button>
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: '12px' }}>
                <button type="button" className="action-btn" onClick={() => setIsHabitoModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar Hábito</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
