import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, type Proyecto, type Metrica, type ProyectoMetrica } from '../db/localDb';
import { 
  getArea, getProyectos, createProyecto, updateProyecto,
  getMetricas, createMetrica, updateMetrica,
  getProyectoMetricas, createProyectoMetrica, updateProyectoMetrica
} from '../services/api';
import { 
  ArrowLeft, Folder, BarChart2, Plus, Edit2, Trash2, X, 
  Calendar, Target, Link as LinkIcon
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

  // Refrescar DB
  useEffect(() => {
    if (navigator.onLine && !isNaN(idArea)) {
      getArea(idArea).catch(console.error);
      getProyectos().catch(console.error);
      getMetricas().catch(console.error);
      getProyectoMetricas().catch(console.error);
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

    </div>
  );
}
