import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, type Task } from '../db/localDb';
import { getTasks, createTask, updateTask, deleteTask, createPuntosGanados, deletePuntosGanados } from '../services/api';
import { Clock, CheckCircle2, Circle, Trash2, Calendar, Edit2, X } from 'lucide-react';
import './TareasView.css';

const COLUMNS = [
  { id: 'do', title: 'Por Hacer', icon: Circle, color: 'var(--text-muted)' },
  { id: 'doing', title: 'En Progreso', icon: Clock, color: '#f59e0b' },
  { id: 'done', title: 'Completado', icon: CheckCircle2, color: '#10b981' }
];

export function TareasView() {
  // Cargar tareas del servidor al montar
  useEffect(() => {
    getTasks().catch(console.error);
  }, []);

  // Estado para el formulario de Creación
  const [taskname, setTaskname] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [points, setPoints] = useState<number | string>(10);

  // Estado para Drag & Drop
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);

  // Estado para el Modal de Edición
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Estado para filtro de columnas en móvil
  const [mobileTab, setMobileTab] = useState<'all' | 'do' | 'doing' | 'done'>('all');

  const tasks = useLiveQuery(() => localDB.tasks.toArray(), []) || [];

  // ─── HANDLERS DE CREACIÓN ───
  const handleCreateTask = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!taskname.trim()) return;

    await createTask({
      taskname,
      description,
      due_date: dueDate || null,
      status: 'do',
      points: Number(points) || 0,
    });
    
    // Limpiar formulario
    setTaskname('');
    setDescription('');
    setDueDate('');
    setPoints(10);
  };

  // ─── HANDLERS DE BORRADO Y EDICIÓN ───
  const handleDelete = async (id?: number) => {
    if (!id) return;
    if (confirm('¿Estás seguro de eliminar esta tarea?')) {
      await deleteTask(id);
    }
  };

  const handleEditClick = (task: Task) => {
    let rawDue: any = task.due_date;
    if (typeof rawDue === 'object' && rawDue !== null && rawDue.Time !== undefined) {
      rawDue = rawDue.Valid ? rawDue.Time : '';
    }
    if (typeof rawDue === 'string') {
      const match = rawDue.match(/^(\d{4}-\d{2}-\d{2})/);
      rawDue = match ? match[1] : rawDue;
    }
    setEditingTask({ ...task, due_date: rawDue || '' });
  };

  const handleStatusChangeLogic = async (task: Task, newStatus: string) => {
    if (task.status === newStatus) return;

    await updateTask(task.id!, { ...task, status: newStatus });

    const isCompletedStatus = (s: string) => s === 'done' || s === 'inactivo';
    const wasCompleted = isCompletedStatus(task.status);
    const isCompleted = isCompletedStatus(newStatus);

    if (!wasCompleted && isCompleted) {
      console.log(`Otorgando puntos por tarea ${task.id}:`, task.points);
      await createPuntosGanados({
        id_task: task.id,
        points: task.points,
        fecha_registro: new Date().toISOString()
      });
    } else if (wasCompleted && !isCompleted) {
      console.log(`Buscando registro de puntos para eliminar de tarea ${task.id}...`);
      const allPoints = await localDB.puntos_ganados.toArray();
      console.log('Todos los puntos locales:', allPoints);
      
      const pointsRecord = allPoints.find(p => p.id_task === task.id);
      if (pointsRecord && pointsRecord.id) {
        console.log(`Eliminando registro de puntos con ID:`, pointsRecord.id);
        await deletePuntosGanados(pointsRecord.id);
      } else {
        console.warn(`No se encontró registro de puntos para la tarea ${task.id}`);
      }
    }
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editingTask.id) return;

    const originalTask = tasks.find(t => t.id === editingTask.id);

    // Update non-status fields first (if status changed, it'll be updated below)
    await updateTask(editingTask.id, {
      taskname: editingTask.taskname,
      description: editingTask.description,
      due_date: editingTask.due_date || null,
      points: Number(editingTask.points) || 0,
      status: originalTask?.status || editingTask.status
    });

    if (originalTask && originalTask.status !== editingTask.status) {
      // Refresh the task object to pass to logic
      const updatedTask = { ...originalTask, points: Number(editingTask.points) || 0 };
      await handleStatusChangeLogic(updatedTask, editingTask.status);
    }

    setEditingTask(null);
  };

  // ─── HANDLERS DE DRAG & DROP ───
  const handleDragStart = (e: React.DragEvent, taskId: number) => {
    e.dataTransfer.setData('taskId', taskId.toString());
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault(); 
    setDraggedColumn(columnId); 
  };

  const handleDragLeave = () => setDraggedColumn(null);

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    setDraggedColumn(null);
    
    const taskIdStr = e.dataTransfer.getData('taskId');
    if (!taskIdStr) return;
    
    const taskId = Number(taskIdStr);
    const task = tasks.find(t => t.id === taskId);
    
    if (task && task.status !== newStatus) {
      await handleStatusChangeLogic(task, newStatus);
    }
  };

  return (
    <div className="kanban-container">
      <div className="kanban-header-bar">
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', color: 'var(--text-main)' }}>Tareas</h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 16px' }}>Organiza tu flujo de trabajo.</p>
        </div>
      </div>

      {/* ─── FORMULARIO DE CREACIÓN (RESPONSIVE CON LABELS) ─── */}
      <form className="add-task-form" onSubmit={handleCreateTask}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>
          + Nueva Tarea
        </h3>
        
        <div className="task-form-grid">
          <div className="form-group-task" style={{ gridColumn: 'span 2' }}>
            <label className="task-label">Título de la Tarea *</label>
            <input 
              type="text" 
              className="add-task-input"
              placeholder="Ej. Revisar capítulo 2 de tesis" 
              value={taskname}
              onChange={(e) => setTaskname(e.target.value)}
              required
            />
          </div>

          <div className="form-group-task" style={{ gridColumn: 'span 2' }}>
            <label className="task-label">Descripción (Opcional)</label>
            <input 
              type="text" 
              className="add-task-input"
              placeholder="Detalles u objetivos de la tarea" 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-group-task">
            <label className="task-label">Fecha Límite</label>
            <input 
              type="date" 
              className="add-task-input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="form-group-task">
            <label className="task-label">Puntos Recompensa</label>
            <input 
              type="number" 
              className="add-task-input"
              placeholder="Puntos" 
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              min="0"
            />
          </div>
        </div>

        <button type="submit" className="add-task-btn">Crear Tarea</button>
      </form>

      {/* ─── SELECTOR DE FILTROS KANBAN ─── */}
      <div className="kanban-filter-tabs">
        <button 
          type="button"
          className={`filter-tab-pill ${mobileTab === 'all' ? 'active' : ''}`}
          onClick={() => setMobileTab('all')}
        >
          Todas <span className="tab-badge">{tasks.length}</span>
        </button>
        {COLUMNS.map(c => {
          const count = tasks.filter(t => t.status === c.id).length;
          return (
            <button
              key={c.id}
              type="button"
              className={`filter-tab-pill ${mobileTab === c.id ? 'active' : ''}`}
              onClick={() => setMobileTab(c.id as any)}
            >
              {c.title} <span className="tab-badge">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ─── TABLERO KANBAN ─── */}
      <div className={`kanban-board ${mobileTab !== 'all' ? 'single-column' : ''}`}>
        {COLUMNS.filter(c => mobileTab === 'all' || mobileTab === c.id).map(column => {
          const columnTasks = tasks.filter(t => t.status === column.id);
          const Icon = column.icon;

          return (
            <div 
              key={column.id} 
              className={`kanban-column ${draggedColumn === column.id ? 'drag-over' : ''}`}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              <h2 className="kanban-column-title">
                <Icon size={20} color={column.color} />
                {column.title}
                <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {columnTasks.length}
                </span>
              </h2>

              {columnTasks.map(task => (
                <div 
                  key={task.id} 
                  className="glass-card kanban-card"
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id!)}
                >
                  <div className="kanban-card-header">
                    <h3 className="kanban-card-title">{task.taskname}</h3>
                    <div className="card-actions">
                      <button onClick={() => handleEditClick(task)} className="action-btn" title="Editar">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(task.id)} className="action-btn" title="Eliminar">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  
                  {task.description && (
                    <p className="kanban-card-desc">
                      {task.description}
                    </p>
                  )}

                  {/* Botones de cambio de estado táctiles (Mobile-friendly) */}
                  <div className="task-quick-status-actions">
                    {task.status !== 'do' && (
                      <button 
                        type="button"
                        className="quick-status-btn" 
                        onClick={() => handleStatusChangeLogic(task, 'do')}
                        title="Mover a Por Hacer"
                      >
                        <Circle size={12} /> Por Hacer
                      </button>
                    )}
                    {task.status !== 'doing' && (
                      <button 
                        type="button"
                        className="quick-status-btn doing" 
                        onClick={() => handleStatusChangeLogic(task, 'doing')}
                        title="Mover a En Progreso"
                      >
                        <Clock size={12} /> En Progreso
                      </button>
                    )}
                    {task.status !== 'done' && (
                      <button 
                        type="button"
                        className="quick-status-btn done" 
                        onClick={() => handleStatusChangeLogic(task, 'done')}
                        title="Marcar como Completado"
                      >
                        <CheckCircle2 size={12} /> Completar
                      </button>
                    )}
                  </div>

                  <div className="kanban-card-footer">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        <Calendar size={14} />
                        {(() => {
                          let rawDate: any = task.due_date;
                          let isDue = true;
                          if (typeof rawDate === 'object' && rawDate !== null && rawDate.Time !== undefined) {
                            rawDate = rawDate.Valid ? rawDate.Time : null;
                          }
                          if (!rawDate) {
                            rawDate = task.created_at;
                            isDue = false;
                          }
                          if (!rawDate) return 'Sin fecha';

                          const str = String(rawDate).trim();
                          const match = str.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
                          if (match) {
                            const dateFormatted = `${match[3].padStart(2, '0')}/${match[2].padStart(2, '0')}/${match[1]}`;
                            return isDue ? `Vence: ${dateFormatted}` : dateFormatted;
                          }
                          const d = new Date(rawDate);
                          if (!isNaN(d.getTime())) {
                            const dateFormatted = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                            return isDue ? `Vence: ${dateFormatted}` : dateFormatted;
                          }
                          return 'Sin fecha';
                        })()}
                      </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="badge-points">{task.points} pts</span>
                      <span title={task._sincronizado === 1 ? 'Sincronizado' : 'Pendiente subir'}>
                        {task._sincronizado === 1 ? '☁️' : '⏳'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* ─── MODAL DE EDICIÓN ─── */}
      {editingTask && (
        <div className="modal-overlay" onClick={() => setEditingTask(null)}>
          <div className="glass-card modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ color: 'var(--text-main)' }}>Editar Tarea</h2>
              <button onClick={() => setEditingTask(null)} className="action-btn">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleUpdateTask} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input 
                type="text" 
                className="add-task-input"
                value={editingTask.taskname}
                onChange={(e) => setEditingTask({ ...editingTask, taskname: e.target.value })}
                required
              />
              <textarea 
                className="add-task-input"
                value={editingTask.description || ''}
                onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                placeholder="Descripción..."
                rows={3}
                style={{ resize: 'none' }}
              />
              <div className="form-row">
                <input 
                  type="date" 
                  className="add-task-input"
                  value={editingTask.due_date || ''}
                  onChange={(e) => setEditingTask({ ...editingTask, due_date: e.target.value })}
                />
                <input 
                  type="number" 
                  className="add-task-input"
                  value={editingTask.points}
                  onChange={(e) => setEditingTask({ ...editingTask, points: Number(e.target.value) })}
                  min="0"
                />
              </div>
              <div className="form-row">
                <select 
                  className="add-task-input" 
                  value={editingTask.status}
                  onChange={(e) => setEditingTask({ ...editingTask, status: e.target.value })}
                >
                  <option value="do">Por Hacer</option>
                  <option value="doing">En Progreso</option>
                  <option value="done">Completado</option>
                  <option value="inactivo">Inactivo (Ocultar)</option>
                </select>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setEditingTask(null)} className="add-task-btn btn-cancel">
                  Cancelar
                </button>
                <button type="submit" className="add-task-btn">
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}