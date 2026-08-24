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
};

function getTableFromEndpoint(endpoint: string) {
  // Extrae la ruta principal del endpoint (ej: "/api/areas/5" -> "areas")
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
  
  // Si no es DELETE y hay payload, lo mandamos en el body
  if (type !== 'DELETE' && payload) options.body = JSON.stringify(payload);

  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Sync error: ${response.statusText}`);
  
  // Algunos endpoints DELETE responden con 204 No Content (sin JSON)
  if (type === 'DELETE' && response.status === 204) return { success: true };
  
  return response.json();
}

export async function synchronizeData() {
  // 1. Verificamos conexión real antes de intentar nada
  if (!navigator.onLine) return;

  const pending = await localDB.pendingSync.orderBy('timestamp').toArray();
  if (pending.length === 0) return;

  for (const op of pending) {
    try {
      const serverResult = await processPendingOperation(op);
      const table = getTableFromEndpoint(op.endpoint);

      // Solo necesitamos hacer ajustes locales en CREATE. 
      // Los UPDATE y DELETE ya se aplicaron de forma optimista en la UI.
      if (table && op.type === 'CREATE') {
        
        // Buscamos el registro temporal (el más antiguo no sincronizado)
        const tempItems = await table.filter((item: any) => item._sincronizado === 0).toArray();
        
        if (tempItems.length > 0) {
          const tempItem = tempItems[0];
          
          // Obtenemos el nombre exacto de la llave primaria ('id', 'idFormulario', etc.)
          const pkName = table.schema.primKey.name;
          const tempId = tempItem[pkName];
          
          // Eliminamos el registro temporal
          await table.delete(tempId);
          
          // Mezclamos los datos locales con los del servidor
          const finalData = { 
            ...tempItem, 
            ...serverResult, 
            _sincronizado: 1 
          };
          
          // Aseguramos de setear la Primary Key correcta según el backend
          // Esto maneja las tablas con AutoIncrement y las de UUIDs personalizados
          if (serverResult.id) finalData.id = serverResult.id;
          if (serverResult.id_formulario) finalData.idFormulario = serverResult.id_formulario;
          if (serverResult.id_macro) finalData.idMacro = serverResult.id_macro;
          if (serverResult.id_dayli_track) finalData.idDayliTrack = serverResult.id_dayli_track;
          if (serverResult.id_food_log) finalData.idFoodLog = serverResult.id_food_log;

          // Guardamos el registro definitivo
          await table.put(finalData);
        }
      }

      // Operación exitosa, la quitamos de la cola de pendientes
      await localDB.pendingSync.delete(op.id!);
      
    } catch (error) {
      console.error(`Fallo sincronizando operación en ${op.endpoint}:`, error);
      // Rompemos el ciclo para mantener el orden de la cola (FIFO)
      // Así evitamos mandar un UPDATE de algo que falló al hacer CREATE
      break; 
    }
  }
}

export async function retryPendingOperation(id: number) {
  const op = await localDB.pendingSync.get(id);
  if (!op) throw new Error('Operation not found');
  
  const serverResult = await processPendingOperation(op);
  const table = getTableFromEndpoint(op.endpoint);
  
  if (table && op.type !== 'DELETE') {
    // Si la operación tenía localId, tratamos de actualizar
    if (op.localId) {
      await table.update(op.localId as any, { 
        ...serverResult,
        _sincronizado: 1 
      });
    }
  } else if (table && op.type === 'DELETE') {
    if (op.localId) {
      await table.delete(op.localId as any);
    }
  }
  
  await localDB.pendingSync.delete(id);
}

export async function discardPendingOperation(id: number) {
  // Solo eliminamos la operación pendiente, dejamos el registro local tal como está.
  await localDB.pendingSync.delete(id);
}

// ─── Descarga Global Segura ───
import { 
  getAreas, getProyectos, getMetricas, getProyectoMetricas, getRegistroEvaluaciones,
  getRewards, getPuntosUsados, getTasks, getPuntosGanados, getFormularios,
  getMacros, getDayliTracks, getFoodLogs,
  getProyectoHabitos, getProyectoTareas, getRegistroHabitos, getRegistroTareas
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
      getRegistroTareas()
    ]);
  } catch (error) {
    console.error("Error al descargar datos globales:", error);
  }
}