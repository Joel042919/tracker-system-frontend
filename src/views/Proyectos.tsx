import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, type Proyecto } from '../db/localDb';
import { 
  getAreas, getProyectos, getMetricas, getProyectoMetricas,
  createProyecto, updateProyecto 
} from '../services/api';
import { FolderPlus, Edit2, Trash2, X, AlertTriangle, Calendar, Target, Info } from 'lucide-react';
import './Proyectos.css';

export function ProyectosView() {
  // ─── ESTADOS DE UI ───
  const [filterArea, setFilterArea] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('1'); // Por defecto '1' (Activos)
  
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  
  const [selectedProject, setSelectedProject] = useState<Proyecto | null>(null);

  // Estado del Formulario
  const initialForm = { id_area: '', nombre: '', descripcion: '', meta: '', fecha_inicio: '', fecha_fin_planeado: '' };
  const [formData, setFormData] = useState(initialForm);

  // ─── CONSULTAS REACTIVAS A LOCAL DB ───
  const areas = useLiveQuery(() => localDB.areas.toArray(), []) || [];
  const proyectos = useLiveQuery(() => localDB.proyectos.orderBy('created_at').reverse().toArray(), []) || [];
  const metricas = useLiveQuery(() => localDB.metricas.toArray(), []) || [];
  const proyectoMetricas = useLiveQuery(() => localDB.proyecto_metricas.toArray(), []) || [];

  // Fetch en segundo plano para actualizar la DB local si hay internet
  useEffect(() => {
    if (navigator.onLine) {
      Promise.all([getAreas(), getProyectos(), getMetricas(), getProyectoMetricas()]).catch(console.error);
    }
  }, []);

  // ─── LÓGICA DE FILTRADO ───
  const filteredProyectos = proyectos.filter(p => {
    const matchArea = filterArea === 'all' || p.id_area === Number(filterArea);
    const matchStatus = filterStatus === 'all' || p.estado === Number(filterStatus);
    return matchArea && matchStatus;
  });

  // ─── HANDLERS DE FORMULARIO ───
  const openCreateModal = () => {
    setFormData(initialForm);
    setSelectedProject(null);
    setIsFormModalOpen(true);
  };

  const openEditModal = (proyecto: Proyecto, e: React.MouseEvent) => {
    e.stopPropagation(); // Evita abrir el modal de detalles
    setSelectedProject(proyecto);
    setFormData({
      id_area: proyecto.id_area.toString(),
      nombre: proyecto.nombre,
      descripcion: proyecto.descripcion,
      meta: proyecto.meta,
      fecha_inicio: proyecto.fecha_inicio.slice(0, 10), // Formato para input type="date"
      fecha_fin_planeado: proyecto.fecha_fin_planeado.slice(0, 10)
    });
    setIsFormModalOpen(true);
  };

  const handleSave = async (e: React.SubmitEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      id_area: Number(formData.id_area)
    };

    if (selectedProject?.id) {
      // Editar
      await updateProyecto(selectedProject.id, payload);
    } else {
      // Crear (el API le asignará estado: 1 por defecto)
      await createProyecto(payload);
    }
    setIsFormModalOpen(false);
  };

  // ─── HANDLERS DE ELIMINACIÓN (SOFT DELETE) ───
  const openDeleteModal = (proyecto: Proyecto, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedProject(proyecto);
    setIsDeleteModalOpen(true);
  };

  const confirmSoftDelete = async () => {
    if (selectedProject?.id) {
      // Soft Delete: Actualizamos el estado a 0
      await updateProyecto(selectedProject.id, { estado: 0 });
    }
    setIsDeleteModalOpen(false);
    setSelectedProject(null);
  };

  // ─── HANDLERS DE DETALLES ───
  const openDetails = (proyecto: Proyecto) => {
    setSelectedProject(proyecto);
    setIsDetailModalOpen(true);
  };

  // Función auxiliar para obtener las métricas asignadas a un proyecto
  const getMetricasOfProject = (idProyecto: number) => {
    const relations = proyectoMetricas.filter(pm => pm.id_proyecto === idProyecto);
    return relations.map(rel => metricas.find(m => m.id === rel.id_metrica)).filter(Boolean);
  };

  return (
    <div className="proyectos-container">
      
      {/* ── HEADER & FILTROS ── */}
      <div className="proyectos-header">
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', color: 'var(--text-main)' }}>Proyectos</h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>Gestiona tus iniciativas y objetivos.</p>
        </div>
        
        <div className="filters-bar">
          <div className="filter-group">
            <span style={{ color: 'var(--text-muted)' }}>Área:</span>
            <select 
              className="glass-select" 
              value={filterArea} 
              onChange={e => setFilterArea(e.target.value)}
            >
              <option value="all">Todas las áreas</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
          
          <div className="filter-group">
            <span style={{ color: 'var(--text-muted)' }}>Estado:</span>
            <select 
              className="glass-select" 
              value={filterStatus} 
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="1">Activos</option>
              <option value="0">Eliminados</option>
            </select>
          </div>

          <button className="btn-primary" onClick={openCreateModal}>
            <FolderPlus size={18} /> Nuevo Proyecto
          </button>
        </div>
      </div>

      {/* ── GRID DE TARJETAS ── */}
      <div className="proyectos-grid">
        {filteredProyectos.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>No se encontraron proyectos con estos filtros.</p>
        )}
        
        {filteredProyectos.map(p => {
          const areaDelProyecto = areas.find(a => a.id === p.id_area);
          
          return (
            <div key={p.id} className="glass-card proyecto-card" onClick={() => openDetails(p)}>
              <div className="proyecto-header">
                <div>
                  <h3 className="proyecto-title">{p.nombre}</h3>
                  <span className="proyecto-area-badge">
                    {areaDelProyecto ? areaDelProyecto.nombre : 'Área desconocida'}
                  </span>
                </div>
                <span className={`proyecto-status ${p.estado === 1 ? 'status-activo' : 'status-inactivo'}`}>
                  {p.estado === 1 ? 'Activo' : 'Eliminado'}
                </span>
              </div>
              
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {p.descripcion}
              </p>

              <div className="proyecto-dates">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} /> Inicio: {new Date(p.fecha_inicio).toLocaleDateString()}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Target size={14} /> Meta: {new Date(p.fecha_fin_planeado).toLocaleDateString()}
                </span>
              </div>

              {/* Botones de acción (no abren los detalles por el e.stopPropagation) */}
              <div className="proyecto-actions">
                <span title={p._sincronizado === 1 ? 'Sincronizado' : 'Pendiente'} style={{ marginRight: 'auto', alignSelf: 'center' }}>
                  {p._sincronizado === 1 ? '☁️' : '⏳'}
                </span>
                
                {p.estado === 1 && (
                  <>
                    <button className="action-btn" onClick={(e) => openEditModal(p, e)} title="Editar">
                      <Edit2 size={16} />
                    </button>
                    <button className="action-btn" onClick={(e) => openDeleteModal(p, e)} title="Desactivar/Eliminar">
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MODAL: CREAR / EDITAR PROYECTO ── */}
      {isFormModalOpen && (
        <div className="modal-overlay" onClick={() => setIsFormModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedProject ? 'Editar Proyecto' : 'Nuevo Proyecto'}</h2>
              <button className="action-btn" onClick={() => setIsFormModalOpen(false)}><X size={24} /></button>
            </div>
            <form onSubmit={handleSave} className="modal-body">
              <div className="form-group">
                <label>Área Asignada *</label>
                <select 
                  className="glass-select" 
                  value={formData.id_area} 
                  onChange={e => setFormData({...formData, id_area: e.target.value})}
                  required
                >
                  <option value="" disabled>Selecciona un área...</option>
                  {areas.filter(a => a.estado === 1).map(a => (
                    <option key={a.id} value={a.id}>{a.nombre}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>Nombre del Proyecto *</label>
                <input type="text" className="form-input" required
                  value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} 
                />
              </div>

              <div className="form-group">
                <label>Meta Principal *</label>
                <input type="text" className="form-input" required
                  value={formData.meta} onChange={e => setFormData({...formData, meta: e.target.value})} 
                />
              </div>

              <div className="form-group">
                <label>Descripción</label>
                <textarea className="form-textarea" rows={3} 
                  value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} 
                />
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Fecha Inicio *</label>
                  <input type="date" className="form-input" required
                    value={formData.fecha_inicio} onChange={e => setFormData({...formData, fecha_inicio: e.target.value})} 
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Fin Planeado *</label>
                  <input type="date" className="form-input" required
                    value={formData.fecha_fin_planeado} onChange={e => setFormData({...formData, fecha_fin_planeado: e.target.value})} 
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="action-btn" onClick={() => setIsFormModalOpen(false)} style={{ border: '1px solid var(--glass-border)' }}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar Proyecto</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIRMACIÓN DE ELIMINACIÓN ── */}
      {isDeleteModalOpen && selectedProject && (
        <div className="modal-overlay" onClick={() => setIsDeleteModalOpen(false)}>
          <div className="glass-card modal-content" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
                <AlertTriangle /> Confirmar
              </h2>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-main)', margin: 0 }}>
                ¿Estás seguro de que deseas eliminar (desactivar) el proyecto <strong>{selectedProject.nombre}</strong>?
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
                El proyecto ya no aparecerá en las listas activas, pero sus datos históricos se mantendrán.
              </p>
            </div>
            <div className="modal-footer">
              <button className="action-btn" onClick={() => setIsDeleteModalOpen(false)} style={{ border: '1px solid var(--glass-border)' }}>Cancelar</button>
              <button className="btn-primary btn-danger" onClick={confirmSoftDelete}>Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DETALLES DEL PROYECTO ── */}
      {isDetailModalOpen && selectedProject && (
        <div className="modal-overlay" onClick={() => setIsDetailModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Detalles del Proyecto</h2>
              <button className="action-btn" onClick={() => setIsDetailModalOpen(false)}><X size={24} /></button>
            </div>
            
            <div className="modal-body">
              {/* Info General */}
              <div className="details-section">
                <h3><Info size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }}/> Información General</h3>
                <p><strong>Nombre:</strong> {selectedProject.nombre}</p>
                <p><strong>Área:</strong> {areas.find(a => a.id === selectedProject.id_area)?.nombre || 'N/A'}</p>
                <p><strong>Meta:</strong> {selectedProject.meta}</p>
                <p><strong>Descripción:</strong> {selectedProject.descripcion}</p>
              </div>

              {/* Tiempos */}
              <div className="details-section">
                <h3><Calendar size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }}/> Cronograma</h3>
                <p><strong>Inicio:</strong> {new Date(selectedProject.fecha_inicio).toLocaleDateString()}</p>
                <p><strong>Fin Planeado:</strong> {new Date(selectedProject.fecha_fin_planeado).toLocaleDateString()}</p>
                {selectedProject.fecha_fin_real && (
                  <p><strong>Fin Real:</strong> {new Date(selectedProject.fecha_fin_real).toLocaleDateString()}</p>
                )}
              </div>

              {/* Métricas Asignadas */}
              <div className="details-section">
                <h3><Target size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }}/> Métricas Asignadas</h3>
                {getMetricasOfProject(selectedProject.id!).length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No hay métricas asignadas a este proyecto.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-main)' }}>
                    {getMetricasOfProject(selectedProject.id!).map(m => (
                      <li key={m?.id}><strong>{m?.nombre}:</strong> {m?.descripcion} ({m?.points} pts)</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            
          </div>
        </div>
      )}

    </div>
  );
}