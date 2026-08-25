import { localDB, type PendingOperation } from '../db/localDb';

// ─── Mapa para saber a qué tabla pertenece cada endpoint ───
const tableMap: Record<string, any> = {
  'areas': localDB.areas,
  'proyectos': localDB.proyectos,
  'metricas': localDB.metricas,
  'proyecto-metricas': localDB.proyecto_metricas,
  'registro-evaluaciones': localDB.registro_evaluaciones,
  'rewards': localDB.rewards,
  'puntos-usados': localDB.puntos_usados,
  'tasks': localDB.tasks,
  'puntos-ganados': localDB.puntos_ganados,
  'formularios': localDB.formularios,
  'macros': localDB.macros,
  'dayli-tracks': localDB.dayliTracks,
  'food-logs': localDB.foodLogs,
  'proyecto-habitos': localDB.proyecto_habitos,
  'proyecto-tareas': localDB.proyecto_tareas,
  'registro-habitos': localDB.registro_habitos,
  'registro-tareas': localDB.registro_tareas,
  'medios': localDB.medios,
  'saldos': localDB.saldos_actuales,
  'categorias': localDB.categorias_finanzas,
  'movimientos': localDB.movimientos,
  'egresos-fijos': localDB.egresos_fijos,
  'pagos-programados': localDB.pagos_programados,
  'presupuestos': localDB.presupuestos,
  'alertas-pago': localDB.alertas_pago,
};

function getTableFromEndpoint(endpoint: string) {
  const match = endpoint.match(/^\/api\/([^\/]+)/);
  if (match && match[1]) {
    return tableMap[match[1]];
  }
  return null;
}

async function processPendingOperation(op: PendingOperation) {
  const { type, endpoint, payload } = op;
  const url = `${import.meta.env.VITE_API_URL}${endpoint}`;
  
  const options: RequestInit = {
    method: type === 'CREATE' ? 'POST' : type === 'UPDATE' ? 'PUT' : 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  };
  
  if (type !== 'DELETE' && payload) options.body = JSON.stringify(payload);

  const response = await fetch(url, options);
  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errJson = await response.json();
      if (errJson?.error) errorDetail = errJson.error;
    } catch {}
    throw new Error(`Sync error (${response.status}): ${errorDetail}`);
  }
  
  if (type === 'DELETE' && response.status === 204) return { success: true };
  
  return response.json();
}

export async function synchronizeData() {
  if (!navigator.onLine) return;

  const pending = await localDB.pendingSync.orderBy('timestamp').toArray();
  if (pending.length === 0) return;

  for (const op of pending) {
    try {
      const serverResult = await processPendingOperation(op);
      const table = getTableFromEndpoint(op.endpoint);

      if (table && op.type === 'CREATE') {
        let tempItem: any;
        if (op.payload?.id) {
          tempItem = await table.get(op.payload.id);
        }
        if (!tempItem) {
          const tempItems = await table.filter((item: any) => item._sincronizado === 0).toArray();
          if (tempItems.length > 0) tempItem = tempItems[0];
        }

        if (tempItem) {
          const pkName = table.schema.primKey.name;
          const tempId = tempItem[pkName];
          
          if (serverResult.id && serverResult.id !== tempId) {
            await table.delete(tempId);
          }
          
          const finalData = { 
            ...tempItem, 
            ...serverResult, 
            _sincronizado: 1 
          };
          
          if (serverResult.id) finalData.id = serverResult.id;
          if (serverResult.id_formulario) finalData.idFormulario = serverResult.id_formulario;
          if (serverResult.id_macro) finalData.idMacro = serverResult.id_macro;
          if (serverResult.id_dayli_track) finalData.idDayliTrack = serverResult.id_dayli_track;
          if (serverResult.id_food_log) finalData.idFoodLog = serverResult.id_food_log;

          await table.put(finalData);
        }
      } else if (table && op.type === 'UPDATE') {
        const pkName = table.schema.primKey.name;
        const targetId = op.payload?.[pkName] || op.localId;
        if (targetId) {
          await table.update(targetId, { _sincronizado: 1 });
        }
      }

      await localDB.pendingSync.delete(op.id!);
      
    } catch (error: any) {
      const errMsg = error?.message || 'Error desconocido';
      console.error(`Fallo sincronizando operación en ${op.endpoint}:`, errMsg);
      if (op.id) {
        await localDB.pendingSync.update(op.id, {
          error: errMsg,
          lastAttempt: new Date().toISOString()
        });
      }
      break; 
    }
  }
}

export async function retryPendingOperation(id: number) {
  const op = await localDB.pendingSync.get(id);
  if (!op) throw new Error('Operación no encontrada');
  
  try {
    const serverResult = await processPendingOperation(op);
    const table = getTableFromEndpoint(op.endpoint);
    
    if (table && op.type === 'CREATE') {
      let tempItem: any;
      if (op.payload?.id) {
        tempItem = await table.get(op.payload.id);
      }
      if (!tempItem) {
        const tempItems = await table.filter((item: any) => item._sincronizado === 0).toArray();
        if (tempItems.length > 0) tempItem = tempItems[0];
      }
      if (tempItem) {
        const pkName = table.schema.primKey.name;
        const tempId = tempItem[pkName];
        if (serverResult.id && serverResult.id !== tempId) {
          await table.delete(tempId);
        }
        await table.put({
          ...tempItem,
          ...serverResult,
          _sincronizado: 1
        });
      }
    } else if (table && op.type === 'UPDATE') {
      const pkName = table.schema.primKey.name;
      const targetId = op.payload?.[pkName] || op.localId;
      if (targetId) {
        await table.update(targetId, { _sincronizado: 1 });
      }
    } else if (table && op.type === 'DELETE') {
      if (op.localId) {
        await table.delete(op.localId as any);
      }
    }
    
    await localDB.pendingSync.delete(id);
  } catch (error: any) {
    const errMsg = error?.message || 'Error desconocido';
    await localDB.pendingSync.update(id, {
      error: errMsg,
      lastAttempt: new Date().toISOString()
    });
    throw error;
  }
}

export async function discardPendingOperation(id: number) {
  await localDB.pendingSync.delete(id);
}

// ─── Descarga Global Segura ───
import { 
  getAreas, getProyectos, getMetricas, getProyectoMetricas, getRegistroEvaluaciones,
  getRewards, getPuntosUsados, getTasks, getPuntosGanados, getFormularios,
  getMacros, getDayliTracks, getFoodLogs,
  getProyectoHabitos, getProyectoTareas, getRegistroHabitos, getRegistroTareas,
  getMedios, getCategoriasFinanzas, getMovimientos, getEgresosFijos,
  getPagosProgramados, getPresupuestos, getAlertasPago
} from './api';

export async function downloadAllData() {
  if (!navigator.onLine) return;
  try {
    await Promise.all([
      getAreas(),
      getProyectos(),
      getMetricas(),
      getProyectoMetricas(),
      getRegistroEvaluaciones(),
      getRewards(),
      getPuntosUsados(),
      getTasks(),
      getPuntosGanados(),
      getFormularios(),
      getMacros(),
      getDayliTracks(),
      getFoodLogs(),
      getProyectoHabitos(),
      getProyectoTareas(),
      getRegistroHabitos(),
      getRegistroTareas(),
      getMedios(),
      getCategoriasFinanzas(),
      getMovimientos(),
      getEgresosFijos(),
      getPagosProgramados(),
      getPresupuestos(),
      getAlertasPago()
    ]);
  } catch (error) {
    console.error("Error en sincronización pasiva:", error);
  }
}