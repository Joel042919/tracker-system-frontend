import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB } from '../db/localDb';
import { retryPendingOperation, discardPendingOperation, synchronizeData } from '../services/sync';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import toast from 'react-hot-toast';
import './SyncAdminView.css';

export function SyncAdminView() {
  const isOnline = useOnlineStatus();
  const [isSyncing, setIsSyncing] = useState(false);

  // Consultar todas las tablas usando Dexie.js
  const tableStatuses = useLiveQuery(async () => {
    const tables = [
      'areas', 'proyectos', 'metricas', 'proyecto_metricas', 
      'registro_evaluaciones', 'rewards', 'puntos_usados', 
      'tasks', 'puntos_ganados', 'formularios', 'macros', 
      'dayliTracks', 'foodLogs',
      'proyecto_habitos', 'proyecto_tareas', 'registro_habitos', 'registro_tareas',
      'medios', 'saldos_actuales', 'categorias_finanzas', 'movimientos',
      'egresos_fijos', 'pagos_programados', 'presupuestos', 'alertas_pago'
    ];
    
    const statuses = await Promise.all(tables.map(async (tableName) => {
      const table = (localDB as any)[tableName];
      if (!table) return { name: tableName, total: 0, synced: 0, unsynced: 0 };
      
      const total = await table.count();
      // Asumimos que _sincronizado === 0 es no sincronizado
      const unsynced = await table.filter((r: any) => r._sincronizado === 0).count();
      
      return {
        name: tableName,
        total,
        synced: total - unsynced,
        unsynced
      };
    }));
    return statuses;
  }, []) || [];

  const pendingQueue = useLiveQuery(() => localDB.pendingSync.orderBy('timestamp').toArray(), []) || [];

  const handleRetry = async (id: number) => {
    if (!isOnline) {
      toast.error("Necesitas conexión a internet para reintentar.");
      return;
    }
    const tid = toast.loading("Reintentando operación...");
    try {
      await retryPendingOperation(id);
      toast.success("Operación sincronizada correctamente", { id: tid });
    } catch (error: any) {
      toast.error(`Error al reintentar: ${error.message}`, { id: tid });
    }
  };

  const handleDiscard = async (id: number) => {
    if (window.confirm("¿Seguro que deseas descartar esta operación? El registro local no se eliminará, pero dejará de intentar subirse a la nube.")) {
      await discardPendingOperation(id);
      toast.success("Operación descartada de la cola");
    }
  };

  const forceGlobalSync = async () => {
    if (!isOnline) {
      toast.error("Estás offline.");
      return;
    }
    setIsSyncing(true);
    const tid = toast.loading("Sincronizando todas las operaciones...");
    try {
      await synchronizeData();
      toast.success("Sincronización global completada", { id: tid });
    } catch (error: any) {
      toast.error(`Hubo errores: ${error.message}`, { id: tid });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="sync-container">
      <header className="sync-header">
        <h1>Centro de Diagnóstico y Sincronización</h1>
        <p>Monitorea el estado de tus datos locales frente a la nube y resuelve conflictos manualmente.</p>
        
        <div style={{ marginTop: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <button 
            className="btn-primary" 
            onClick={forceGlobalSync} 
            disabled={!isOnline || isSyncing || pendingQueue.length === 0}
          >
            {isSyncing ? "Sincronizando..." : "Forzar Sincronización Global"}
          </button>
          {!isOnline && <span style={{ color: '#ef4444', fontSize: '14px', fontWeight: 'bold' }}>Offline</span>}
        </div>
      </header>

      <div className="sync-grid">
        {/* COLUMNA IZQUIERDA: Estado de Tablas y Cola de Errores */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <section className="glass-card" style={{ padding: '24px' }}>
            <h2 style={{ color: 'var(--text-main)', marginBottom: '16px' }}>Estado de Tablas (Local DB)</h2>
            <div className="table-status-list">
              {tableStatuses.map(ts => (
                <div key={ts.name} className="table-status-item">
                  <span className="table-name">{ts.name}</span>
                  <div className="table-stats">
                    <span className="stat-synced" title="Registros Sincronizados">✔ {ts.synced}</span>
                    {ts.unsynced > 0 ? (
                      <span className="stat-unsynced" title="Registros Pendientes de Subida">! {ts.unsynced} pend.</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>0 pend.</span>
                    )}
                    <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>Total: {ts.total}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-card" style={{ padding: '24px' }}>
            <h2 style={{ color: 'var(--text-main)', marginBottom: '16px' }}>
              Cola de Pendientes ({pendingQueue.length})
            </h2>
            {pendingQueue.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No hay operaciones atascadas en la cola.</p>
            ) : (
              <div className="pending-queue">
                {pendingQueue.map(op => (
                  <div key={op.id} className="pending-item">
                    <div className="pending-item-header">
                      <span className={`pending-type type-${op.type}`}>{op.type}</span>
                      <span className="pending-endpoint">{op.endpoint}</span>
                    </div>
                    {op.payload && (
                      <div className="pending-payload">
                        {JSON.stringify(op.payload, null, 2)}
                      </div>
                    )}
                    <div className="pending-actions">
                      <button className="btn-retry" onClick={() => handleRetry(op.id!)}>Reintentar</button>
                      <button className="btn-discard" onClick={() => handleDiscard(op.id!)}>Descartar Error</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        {/* COLUMNA DERECHA: Referencia de Conversiones */}
        <div>
          <section className="glass-card doc-section">
            <h3>📖 Guía de Resoluciones</h3>
            
            <div className="doc-item">
              <h4>1. ¿Por qué fallan las fechas?</h4>
              <p>
                El Backend (Go) retorna las fechas en formato ISO universal (ej. <code>2026-07-03T00:00:00Z</code>). 
                Para evitar que el Frontend las desface por tu zona horaria (UTC-5), el localDB requiere enviarlas cortadas como <code>YYYY-MM-DD</code>.
                Si en el Payload ves una fecha con "T", podría generar un "Bad Request" (Error 400).
              </p>
            </div>

            <div className="doc-item">
              <h4>2. Formato snake_case vs camelCase</h4>
              <p>
                Tu interfaz visual en React espera variables en <code>camelCase</code> (ej. <code>idDayliTrack</code>), pero la base de datos en NeonDB requiere <code>snake_case</code> (ej. <code>id_dayli_track</code>).
                La capa de servicios (`api.ts`) hace la conversión. Si falla una inserción por "Columna no existe", verifica en el Payload que las llaves estén correctamente formateadas a <code>snake_case</code> o que el Backend haya sido ajustado.
              </p>
            </div>

            <div className="doc-item">
              <h4>3. Tipos de ID</h4>
              <p>
                - Tablas nuevas (FoodLog, Formularios, DayliTrack) usan <strong>UUIDs (Strings)</strong> generados automáticamente en la nube. Localmente se guardan temporales hasta su confirmación.<br/><br/>
                - Tablas antiguas (Proyectos, Áreas, Tareas) usan <strong>Integers Auto-incrementables</strong>. Cuando creas uno localmente sin internet, se le da un ID grande falso que se reemplaza por el real al sincronizar.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
