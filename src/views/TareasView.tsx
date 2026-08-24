import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, type Task } from '../db/localDb';
import { createTask, updateTask, deleteTask, createPuntosGanados, deletePuntosGanados } from '../services/api';
import { Clock, CheckCircle2, Circle, Trash2, Calendar, Edit2, X } from 'lucide-react';
import './TareasView.css';

const COLUMNS = [
  { id: 'do', title: 'Por Hacer', icon: Circle, color: 'var(--text-muted)' },
  { id: 'doing', title: 'En Progreso', icon: Clock, color: '#f59e0b' },
  { id: 'done', title: 'Completado', icon: CheckCircle2, color: '#10b981' }
];

export function TareasView() {
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
    setEditingTask(task);
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

      {/* ─── FORMULARIO DE CREACIÓN (MOBILE-FIRST) ─── */}
      <form className="add-task-form" onSubmit={handleCreateTask}>
        <div className="form-row">
          <input 
            type="text" 
            className="add-task-input"
            placeholder="Título de la tarea *" 
            value={taskname}
            onChange={(e) => setTaskname(e.target.value)}
            required
          />
          <input 
            type="text" 
            className="add-task-input"
            placeholder="Descripción (opcional)" 
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="form-row">
          <input 
            type="date" 
            className="add-task-input"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            title="Fecha límite"
          />
          <input 
            type="number" 
            className="add-task-input"
            placeholder="Puntos" 
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            min="0"
            title="Puntos de recompensa"
            style={{ maxWidth: '100px' }}
          />
          <button type="submit" className="add-task-btn">Crear Tarea</button>
        </div>
      </form>

      {/* ─── SELECTOR DE COLUMNAS PARA MÓVIL ─── */}
      <div className="kanban-mobile-tabs">
        <button 
          className={`mobile-tab-btn ${mobileTab === 'all' ? 'active' : ''}`}
          onClick={() => setMobileTab('all')}
        >
          Todas ({tasks.length})
        </button>
        {COLUMNS.map(c => {
          const count = tasks.filter(t => t.status === c.id).length;
          return (
            <button
              key={c.id}
              className={`mobile-tab-btn ${mobileTab === c.id ? 'active' : ''}`}
              onClick={() => setMobileTab(c.id as any)}
            >
              {c.title} ({count})
            </button>
          );
        })}
      </div>

      {/* ─── TABLERO KANBAN ─── */}
      <div className="kanban-board">
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
                    <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
                      {task.description}
                    </p>
                  )}

                  <div className="kanban-card-footer">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={14} />
                      {task.due_date ? new Date(task.due_date).toLocaleDateString() : '--'}
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