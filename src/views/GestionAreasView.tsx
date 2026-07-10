import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, type Area } from '../db/localDb';
import { getAreas, createArea, updateArea } from '../services/api';
import { FolderPlus, Edit2, Trash2, X, AlertTriangle, ChevronRight } from 'lucide-react';
import './GestionAreasView.css';

export function GestionAreasView() {
  const navigate = useNavigate();

  // Estados
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);

  const initialForm = { nombre: '', descripcion: '' };
  const [formData, setFormData] = useState(initialForm);

  // Queries locales
  const areas = useLiveQuery(() => localDB.areas.filter(a => a.estado === 1).toArray(), []) || [];
  const proyectos = useLiveQuery(() => localDB.proyectos.filter(p => p.estado === 1).toArray(), []) || [];

  useEffect(() => {
    if (navigator.onLine) {
      getAreas().catch(console.error);
    }
  }, []);

  const openCreateModal = () => {
    setFormData(initialForm);
    setSelectedArea(null);
    setIsFormModalOpen(true);
  };

  const openEditModal = (area: Area, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedArea(area);
    setFormData({ nombre: area.nombre, descripcion: area.descripcion });
    setIsFormModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedArea?.id) {
      await updateArea(selectedArea.id, formData);
    } else {
      await createArea(formData);
    }
    setIsFormModalOpen(false);
  };

  const openDeleteModal = (area: Area, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedArea(area);
    setIsDeleteModalOpen(true);
  };

  const confirmSoftDelete = async () => {
    if (selectedArea?.id) {
      await updateArea(selectedArea.id, { ...selectedArea, estado: 0 } as any);
    }
    setIsDeleteModalOpen(false);
    setSelectedArea(null);
  };

  const goToAreaDetails = (areaId: number) => {
    navigate(`/proyectos/${areaId}`);
  };

  return (
    <div className="gestion-areas-container">
      <div className="gestion-areas-header">
        <div>
          <h1>Gestión de Áreas</h1>
          <p>Organiza tus proyectos y métricas por áreas de enfoque.</p>
        </div>
        <button className="btn-primary" onClick={openCreateModal}>
          <FolderPlus size={18} /> Nueva Área
        </button>
      </div>

      <div className="areas-grid">
        {areas.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>No hay áreas activas. ¡Crea una para empezar!</p>
        )}
        
        {areas.map(area => {
          const areaProjects = proyectos.filter(p => p.id_area === area.id);
          return (
            <div key={area.id} className="area-card" onClick={() => goToAreaDetails(area.id!)}>
              <div className="area-header">
                <h3 className="area-title">{area.nombre}</h3>
                <span title={area._sincronizado === 1 ? 'Sincronizado' : 'Pendiente'} style={{ fontSize: '14px' }}>
                  {area._sincronizado === 1 ? '☁️' : '⏳'}
                </span>
              </div>
              
              <p className="area-desc">{area.descripcion}</p>

              <div className="area-footer">
                <span className="area-stats">
                  {areaProjects.length} Proyecto{areaProjects.length !== 1 ? 's' : ''} <ChevronRight size={14} />
                </span>
                
                <div className="area-actions">
                  <button className="btn-icon" onClick={(e) => openEditModal(area, e)} title="Editar">
                    <Edit2 size={16} />
                  </button>
                  <button className="btn-icon danger" onClick={(e) => openDeleteModal(area, e)} title="Eliminar">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Formulario Area */}
      {isFormModalOpen && (
        <div className="modal-overlay" onClick={() => setIsFormModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedArea ? 'Editar Área' : 'Nueva Área'}</h2>
              <button className="action-btn" onClick={() => setIsFormModalOpen(false)}><X size={24} /></button>
            </div>
            <form onSubmit={handleSave} className="modal-body">
              <div className="form-group">
                <label>Nombre del Área *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required
                  value={formData.nombre} 
                  onChange={e => setFormData({...formData, nombre: e.target.value})} 
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <textarea 
                  className="form-textarea" 
                  rows={3} 
                  value={formData.descripcion} 
                  onChange={e => setFormData({...formData, descripcion: e.target.value})} 
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="action-btn" onClick={() => setIsFormModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar Área</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmación Eliminar */}
      {isDeleteModalOpen && selectedArea && (
        <div className="modal-overlay" onClick={() => setIsDeleteModalOpen(false)}>
          <div className="glass-card modal-content" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
                <AlertTriangle /> Confirmar
              </h2>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-main)', margin: 0 }}>
                ¿Estás seguro de que deseas eliminar (desactivar) el área <strong>{selectedArea.nombre}</strong>?
              </p>
            </div>
            <div className="modal-footer">
              <button className="action-btn" onClick={() => setIsDeleteModalOpen(false)}>Cancelar</button>
              <button className="btn-primary btn-danger" onClick={confirmSoftDelete}>Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
