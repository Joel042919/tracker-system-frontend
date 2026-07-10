import { localDB, boolToNum, numToBool } from '../db/localDb';
import type {
  Area, Proyecto, Metrica, ProyectoMetrica, RegistroEvaluacion,
  Reward, PuntosUsados, Task, PuntosGanados, Formulario,
  Macros, DayliTrack, FoodLog
} from '../db/localDb';

const API_BASE = import.meta.env.VITE_API_URL as string;

// ─── Helpers genéricos ───────────────────────────────────

/** Conversión de objeto servidor → formato Dexie (boolean → 0/1, fechas → string) */
function toLocal<T extends Record<string, any>>(server: T, sincronizado: boolean, extra: Partial<T> = {}): T & { _sincronizado: number } {
  // Copia superficial y convierte campos booleanos comunes: estado, activo, active
  const local: any = { ...server, ...extra };
  for (const key of ['estado', 'activo', 'active']) {
    if (typeof local[key] === 'boolean') local[key] = boolToNum(local[key]);
  }
  // Asegurar _sincronizado
  local._sincronizado = sincronizado ? 1 : 0;
  // Fechas ya vienen como string desde JSON (el backend las serializa como ISO), se mantienen
  return local;
}

/** Convierte un objeto local Dexie al formato que espera el servidor (0/1 → boolean) */
function toServer(local: any): any {
  const server = { ...local };
  // Convertir números a booleanos para el servidor
  if ('estado' in server) server.estado = numToBool(server.estado);
  if ('activo' in server) server.activo = numToBool(server.activo);
  if ('active' in server) server.active = numToBool(server.active);
  // Eliminar campos internos
  delete server._sincronizado;
  delete server._ultimaModificacion;
  // Para UUIDs, eliminar id local si no aplica (el servidor devuelve el ID real)
  if (server.id && typeof server.id === 'number' && (server.idFormulario || server.idMacro || server.idDayliTrack || server.idFoodLog)) {
    // Si la tabla usa UUID, no mandamos el número
    delete server.id;
  }
  return server;
}

/** API fetch básico */
async function apiFetch(url: string, options?: RequestInit) {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) throw new Error(response.statusText);
  return response.json();
}

// ─── Operaciones locales con cola de sincronización ─────

async function addToLocal<T>(
  table: any, 
  payload: any, 
  serverEndpoint: string, 
  constructor: (data: any) => T
): Promise<number | string> {
  const online = navigator.onLine;
  const localData = constructor(payload);
  const localId = await table.add(localData);

  if (online) {
    try {
      const serverData = await apiFetch(serverEndpoint, {
        method: 'POST',
        body: JSON.stringify(toServer(payload)),
      });
      // Reemplazar local con datos del servidor (id real, _sincronizado=1)
      const realId = serverData.id || serverData.idFormulario || serverData.idMacro || serverData.idDayliTrack || serverData.idFoodLog;
      
      // Mezclar el payload original con la respuesta del servidor para no perder campos
      // ya que a veces el servidor solo responde con { message, id }
      const mergedServerData = { ...payload, ...serverData };
      
      if (realId && realId !== localId) {
        await table.delete(localId);
        await table.put(toLocal(mergedServerData, true, { id: realId }));
      } else {
        await table.update(localId, toLocal(mergedServerData, true, { id: realId }));
      }
      return realId || localId;
    } catch {
      await localDB.pendingSync.add({
        type: 'CREATE',
        endpoint: serverEndpoint,
        payload:toServer(payload),
        timestamp: new Date().toISOString(),
      });
    }
  } else {
    await localDB.pendingSync.add({
      type: 'CREATE',
      endpoint: serverEndpoint,
      payload:toServer(payload),
      timestamp: new Date().toISOString(),
    });
  }
  return localId;
}

async function updateLocal<T>(
  table: any,
  localId: number | string,
  payload: any,
  serverEndpoint: string,
  localDataBuilder: (data: any) => Partial<T>
) {
  // Actualizar local primero
  await table.update(localId, { ...localDataBuilder(payload), _ultimaModificacion: new Date().toISOString() });

  if (navigator.onLine) {
    try {
      const serverData = await apiFetch(serverEndpoint, {
        method: 'PUT',
        body: JSON.stringify(toServer(payload)),
      });
      await table.update(localId, toLocal(serverData, true));
    } catch {
      await localDB.pendingSync.add({
        type: 'UPDATE',
        endpoint: serverEndpoint,
        payload: { ...toServer(payload), id: localId }, // incluir id para endpoint
        timestamp: new Date().toISOString(),
      });
    }
  } else {
    await localDB.pendingSync.add({
      type: 'UPDATE',
      endpoint: serverEndpoint,
      payload: { ...toServer(payload), id: localId },
      timestamp: new Date().toISOString(),
    });
  }
}

async function deleteLocal(
  table: any,
  localId: number | string,
  serverEndpoint: string
) {
  await table.delete(localId);
  if (navigator.onLine) {
    try {
      await apiFetch(serverEndpoint, { method: 'DELETE' });
    } catch {
      await localDB.pendingSync.add({
        type: 'DELETE',
        endpoint: serverEndpoint,
        payload: { id: localId },
        timestamp: new Date().toISOString(),
      });
    }
  } else {
    await localDB.pendingSync.add({
      type: 'DELETE',
      endpoint: serverEndpoint,
      payload: { id: localId },
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── Funciones para cada entidad ──────────────────────────

// ── Áreas ──────────────────────────────────────────────────

export async function getAreas(): Promise<Area[]> {
  if (!navigator.onLine) return localDB.areas.toArray();
  try {
    const data = await apiFetch('/api/areas');
    await localDB.areas.clear();
    const localData = data.map((a: any) => toLocal(a, true));
    await localDB.areas.bulkPut(localData);
    return localData as Area[];
  } catch {
    return localDB.areas.toArray();
  }
}

export async function getArea(id: number): Promise<Area | undefined> {
  if (!navigator.onLine) {
    return localDB.areas.get(id);
  }

  try {
    const data = await apiFetch(`/api/areas/${id}`);
    const localData = toLocal(data, true);
    
    // Actualizamos el registro local con la información fresca
    // Usamos .put() porque si existe lo actualiza, y si no, lo crea.
    await localDB.areas.put(localData); 
    
    return localData as Area;
  } catch (error) {
    console.warn(`No se pudo obtener el área ${id} del servidor, cargando caché local.`);
    return localDB.areas.get(id);
  }
}

export async function createArea(input: { nombre: string; descripcion: string }) {
  return addToLocal(localDB.areas, input, '/api/areas', (data) => ({
    nombre: data.nombre,
    descripcion: data.descripcion,
    estado: boolToNum(true),
    created_at: new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updateArea(id: number, input: { nombre: string; descripcion: string }) {
  await updateLocal(localDB.areas, id, input, `/api/areas/${id}`, (data) => ({
    nombre: data.nombre,
    descripcion: data.descripcion,
  }));
}

export async function deleteArea(id: number) {
  await deleteLocal(localDB.areas, id, `/api/areas/${id}`);
}

// ── Proyectos ─────────────────────────────────────────────

export async function getProyectos(): Promise<Proyecto[]> {
  if (!navigator.onLine) return localDB.proyectos.toArray();
  try {
    const data = await apiFetch('/api/proyectos');
    await localDB.proyectos.clear();
    const localData = data.map((p: any) => toLocal(p, true));
    await localDB.proyectos.bulkPut(localData);
    return localData as Proyecto[];
  } catch {
    return localDB.proyectos.toArray();
  }
}

export async function getProyecto(id: number): Promise<Proyecto | undefined> {
  if (!navigator.onLine) return localDB.proyectos.get(id);
  try {
    const data = await apiFetch(`/api/proyectos/${id}`);
    const localData = toLocal(data, true);
    await localDB.proyectos.put(localData);
    return localData as Proyecto;
  } catch (error) {
    console.warn(`No se pudo obtener el proyecto ${id} del servidor, cargando caché local.`);
    return localDB.proyectos.get(id);
  }
}

export async function createProyecto(input: any) {
  return addToLocal(localDB.proyectos, input, '/api/proyectos', (data) => ({
    ...data,
    estado: boolToNum(true),
    created_at: new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updateProyecto(id: number, input: any) {
  await updateLocal(localDB.proyectos, id, input, `/api/proyectos/${id}`, (data) => data);
}

export async function deleteProyecto(id: number) {
  await deleteLocal(localDB.proyectos, id, `/api/proyectos/${id}`);
}

// ── Métricas ──────────────────────────────────────────────

// ... (siguiendo el mismo patrón para todas las tablas)
// Por brevedad, se muestran las funciones genéricas pero se debe replicar el patrón.

// Métricas, ProyectoMetrica, RegistroEvaluacion, Reward, PuntosUsados, Task, PuntosGanados,
// Formulario, Macros, DayliTrack, FoodLog
// Cada uno tendrá get, create, update, delete.

// Ejemplo para Métricas:
export async function getMetricas(): Promise<Metrica[]> {
  if (!navigator.onLine) return localDB.metricas.toArray();
  try {
    const data = await apiFetch('/api/metricas');
    await localDB.metricas.clear();
    const localData = data.map((m: any) => toLocal(m, true));
    await localDB.metricas.bulkPut(localData);
    return localData as Metrica[];
  } catch {
    return localDB.metricas.toArray();
  }
}

export async function createMetrica(input: any) {
  const processedInput = {
    ...input,
    schema_esperado: typeof input.schema_esperado === 'string' ? input.schema_esperado : JSON.stringify(input.schema_esperado),
    resultados_esperado: input.resultados_esperado ? (typeof input.resultados_esperado === 'string' ? input.resultados_esperado : JSON.stringify(input.resultados_esperado)) : null,
  };
  return addToLocal(localDB.metricas, processedInput, '/api/metricas', (data) => ({
    ...data,
    estado: boolToNum(true),
    created_at: new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function getMetrica(id: number): Promise<Metrica | undefined> {
  if (!navigator.onLine) return localDB.metricas.get(id);
  try {
    const data = await apiFetch(`/api/metricas/${id}`);
    const localData = toLocal(data, true);
    await localDB.metricas.put(localData);
    return localData as Metrica;
  } catch (error) {
    console.warn(`No se pudo obtener la métrica ${id} del servidor, cargando caché local.`);
    return localDB.metricas.get(id);
  }
}

export async function updateMetrica(id: number, input: any) {
  const processedInput = {
    ...input,
    schema_esperado: typeof input.schema_esperado === 'string' ? input.schema_esperado : JSON.stringify(input.schema_esperado),
    resultados_esperado: input.resultados_esperado ? (typeof input.resultados_esperado === 'string' ? input.resultados_esperado : JSON.stringify(input.resultados_esperado)) : null,
  };
  await updateLocal(localDB.metricas, id, processedInput, `/api/metricas/${id}`, (data) => data);
}

export async function deleteMetrica(id: number) {
  await deleteLocal(localDB.metricas, id, `/api/metricas/${id}`);
}

// ── ProyectoMétrica ───────────────────────────────────────

export async function getProyectoMetricas(): Promise<ProyectoMetrica[]> {
  if (!navigator.onLine) return localDB.proyecto_metricas.toArray();
  try {
    const data = await apiFetch('/api/proyecto-metricas');
    await localDB.proyecto_metricas.clear();
    const localData = data.map((pm: any) => toLocal(pm, true));
    await localDB.proyecto_metricas.bulkPut(localData);
    return localData as ProyectoMetrica[];
  } catch {
    return localDB.proyecto_metricas.toArray();
  }
}

export async function getProyectoMetrica(id: number): Promise<ProyectoMetrica | undefined> {
  if (!navigator.onLine) return localDB.proyecto_metricas.get(id);
  try {
    const data = await apiFetch(`/api/proyecto-metricas/${id}`);
    const localData = toLocal(data, true);
    await localDB.proyecto_metricas.put(localData);
    return localData as ProyectoMetrica;
  } catch (error) {
    console.warn(`No se pudo obtener la relación proyecto-métrica ${id} del servidor.`);
    return localDB.proyecto_metricas.get(id);
  }
}

export async function createProyectoMetrica(input: any) {
  const processedInput = {
    ...input,
    config_programacion: typeof input.config_programacion === 'string' ? input.config_programacion : JSON.stringify(input.config_programacion),
  };
  return addToLocal(localDB.proyecto_metricas, processedInput, '/api/proyecto-metricas', (data) => ({
    ...data,
    activo: boolToNum(true),
    created_at: new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updateProyectoMetrica(id: number, input: any) {
  const processedInput = {
    ...input,
    config_programacion: typeof input.config_programacion === 'string' ? input.config_programacion : JSON.stringify(input.config_programacion),
  };
  await updateLocal(localDB.proyecto_metricas, id, processedInput, `/api/proyecto-metricas/${id}`, (data) => data);
}

export async function deleteProyectoMetrica(id: number) {
  await deleteLocal(localDB.proyecto_metricas, id, `/api/proyecto-metricas/${id}`);
}

// ── RegistroEvaluación ───────────────────────────────────

export async function getRegistroEvaluaciones(): Promise<RegistroEvaluacion[]> {
  if (!navigator.onLine) return localDB.registro_evaluaciones.toArray();
  try {
    const data = await apiFetch('/api/registro-evaluaciones');
    await localDB.registro_evaluaciones.clear();
    const localData = data.map((r: any) => toLocal(r, true));
    await localDB.registro_evaluaciones.bulkPut(localData);
    return localData as RegistroEvaluacion[];
  } catch {
    return localDB.registro_evaluaciones.toArray();
  }
}

export async function getRegistroEvaluacion(id: number): Promise<RegistroEvaluacion | undefined> {
  if (!navigator.onLine) return localDB.registro_evaluaciones.get(id);
  try {
    const data = await apiFetch(`/api/registro-evaluaciones/${id}`);
    const localData = toLocal(data, true);
    await localDB.registro_evaluaciones.put(localData);
    return localData as RegistroEvaluacion;
  } catch (error) {
    console.warn(`No se pudo obtener el registro de evaluación ${id} del servidor.`);
    return localDB.registro_evaluaciones.get(id);
  }
}

export async function createRegistroEvaluacion(input: any) {
  const processedInput = {
    ...input,
    valores: typeof input.valores === 'string' ? input.valores : JSON.stringify(input.valores),
  };
  return addToLocal(localDB.registro_evaluaciones, processedInput, '/api/registro-evaluaciones', (data) => ({
    ...data,
    created_at: new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updateRegistroEvaluacion(id: number, input: any) {
  const processedInput = {
    ...input,
    valores: typeof input.valores === 'string' ? input.valores : JSON.stringify(input.valores),
  };
  await updateLocal(localDB.registro_evaluaciones, id, processedInput, `/api/registro-evaluaciones/${id}`, (data) => data);
}

export async function deleteRegistroEvaluacion(id: number) {
  await deleteLocal(localDB.registro_evaluaciones, id, `/api/registro-evaluaciones/${id}`);
}

// ── Rewards ───────────────────────────────────────────────

export async function getRewards(): Promise<Reward[]> {
  if (!navigator.onLine) return localDB.rewards.toArray();
  try {
    const data = await apiFetch('/api/rewards');
    await localDB.rewards.clear();
    const localData = data.map((r: any) => toLocal(r, true));
    await localDB.rewards.bulkPut(localData);
    return localData as Reward[];
  } catch {
    return localDB.rewards.toArray();
  }
}

export async function getReward(id: number): Promise<Reward | undefined> {
  if (!navigator.onLine) return localDB.rewards.get(id);
  try {
    const data = await apiFetch(`/api/rewards/${id}`);
    const localData = toLocal(data, true);
    await localDB.rewards.put(localData);
    return localData as Reward;
  } catch (error) {
    console.warn(`No se pudo obtener la recompensa ${id} del servidor.`);
    return localDB.rewards.get(id);
  }
}

export async function createReward(input: any) {
  return addToLocal(localDB.rewards, input, '/api/rewards', (data) => ({
    ...data,
    estado: boolToNum(true),
    created_at: new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updateReward(id: number, input: any) {
  await updateLocal(localDB.rewards, id, input, `/api/rewards/${id}`, (data) => data);
}

export async function deleteReward(id: number) {
  await deleteLocal(localDB.rewards, id, `/api/rewards/${id}`);
}

// ── PuntosUsados ─────────────────────────────────────────

export async function getPuntosUsados(): Promise<PuntosUsados[]> {
  if (!navigator.onLine) return localDB.puntos_usados.toArray();
  try {
    const data = await apiFetch('/api/puntos-usados');
    await localDB.puntos_usados.clear();
    const localData = data.map((pu: any) => toLocal(pu, true));
    await localDB.puntos_usados.bulkPut(localData);
    return localData as PuntosUsados[];
  } catch {
    return localDB.puntos_usados.toArray();
  }
}

export async function getPuntosUsadosById(id: number): Promise<PuntosUsados | undefined> {
  if (!navigator.onLine) return localDB.puntos_usados.get(id);
  try {
    const data = await apiFetch(`/api/puntos-usados/${id}`);
    const localData = toLocal(data, true);
    await localDB.puntos_usados.put(localData);
    return localData as PuntosUsados;
  } catch (error) {
    console.warn(`No se pudo obtener los puntos usados ${id} del servidor.`);
    return localDB.puntos_usados.get(id);
  }
}

export async function createPuntosUsados(input: any) {
  return addToLocal(localDB.puntos_usados, input, '/api/puntos-usados', (data) => ({
    ...data,
    reclaim_date: data.reclaim_date || new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updatePuntosUsados(id: number, input: any) {
  await updateLocal(localDB.puntos_usados, id, input, `/api/puntos-usados/${id}`, (data) => data);
}

export async function deletePuntosUsados(id: number) {
  await deleteLocal(localDB.puntos_usados, id, `/api/puntos-usados/${id}`);
}

// ── Tasks ────────────────────────────────────────────────

export async function getTasks(): Promise<Task[]> {
  if (!navigator.onLine) return localDB.tasks.toArray();
  try {
    const data = await apiFetch('/api/tasks');
    await localDB.tasks.clear();
    const localData = data.map((t: any) => toLocal(t, true));
    await localDB.tasks.bulkPut(localData);
    return localData as Task[];
  } catch {
    return localDB.tasks.toArray();
  }
}

export async function getTask(id: number): Promise<Task | undefined> {
  if (!navigator.onLine) return localDB.tasks.get(id);
  try {
    const data = await apiFetch(`/api/tasks/${id}`);
    const localData = toLocal(data, true);
    await localDB.tasks.put(localData);
    return localData as Task;
  } catch (error) {
    console.warn(`No se pudo obtener la tarea ${id} del servidor.`);
    return localDB.tasks.get(id);
  }
}

export async function createTask(input: any) {
  return addToLocal(localDB.tasks, input, '/api/tasks', (data) => ({
    ...data,
    status: data.status || 'do',
    created_at: new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updateTask(id: number, input: any) {
  await updateLocal(localDB.tasks, id, input, `/api/tasks/${id}`, (data) => data);
}

export async function deleteTask(id: number) {
  await deleteLocal(localDB.tasks, id, `/api/tasks/${id}`);
}

// ── PuntosGanados ────────────────────────────────────────

export async function getPuntosGanados(): Promise<PuntosGanados[]> {
  if (!navigator.onLine) return localDB.puntos_ganados.toArray();
  try {
    const data = await apiFetch('/api/puntos-ganados');
    await localDB.puntos_ganados.clear();
    const localData = data.map((pg: any) => toLocal(pg, true));
    await localDB.puntos_ganados.bulkPut(localData);
    return localData as PuntosGanados[];
  } catch {
    return localDB.puntos_ganados.toArray();
  }
}

export async function getPuntosGanadosById(id: number): Promise<PuntosGanados | undefined> {
  if (!navigator.onLine) return localDB.puntos_ganados.get(id);
  try {
    const data = await apiFetch(`/api/puntos-ganados/${id}`);
    const localData = toLocal(data, true);
    await localDB.puntos_ganados.put(localData);
    return localData as PuntosGanados;
  } catch (error) {
    console.warn(`No se pudo obtener los puntos ganados ${id} del servidor.`);
    return localDB.puntos_ganados.get(id);
  }
}

export async function getPointReviewTotal(): Promise<number> {
  if (!navigator.onLine) {
    const pr = await localDB.point_review.get(1);
    return pr ? pr.total_puntos : 0;
  }
  try {
    const data = await apiFetch('/api/point-review/total');
    const total = data.total_puntos || 0;
    await localDB.point_review.put({ id: 1, total_puntos: total });
    return total;
  } catch {
    const pr = await localDB.point_review.get(1);
    return pr ? pr.total_puntos : 0;
  }
}

export async function createPuntosGanados(input: any) {
  return addToLocal(localDB.puntos_ganados, input, '/api/puntos-ganados', (data) => ({
    ...data,
    fecha_registro: data.fecha_registro || new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updatePuntosGanados(id: number, input: any) {
  await updateLocal(localDB.puntos_ganados, id, input, `/api/puntos-ganados/${id}`, (data) => data);
}

export async function deletePuntosGanados(id: number) {
  await deleteLocal(localDB.puntos_ganados, id, `/api/puntos-ganados/${id}`);
}

// ── Formulario ───────────────────────────────────────────

export async function getFormularios(): Promise<Formulario[]> {
  if (!navigator.onLine) return localDB.formularios.toArray();
  try {
    const data = await apiFetch('/api/formularios');
    await localDB.formularios.clear();
    const localData = data.map((f: any) => toLocal(f, true, { idFormulario: f.id_formulario, active: boolToNum(f.active) }));
    await localDB.formularios.bulkPut(localData);
    return localData as Formulario[];
  } catch {
    return localDB.formularios.toArray();
  }
}

export async function getFormulario(idFormulario: string): Promise<Formulario | undefined> {
  if (!navigator.onLine) return localDB.formularios.get(idFormulario);
  try {
    const data = await apiFetch(`/api/formularios/${idFormulario}`);
    // Ojo aquí: replicamos el mapeo de "id_formulario" a "idFormulario" y el "active"
    const localData = toLocal(data, true, { idFormulario: data.id_formulario, active: boolToNum(data.active) });
    await localDB.formularios.put(localData);
    return localData as Formulario;
  } catch (error) {
    console.warn(`No se pudo obtener el formulario ${idFormulario} del servidor.`);
    return localDB.formularios.get(idFormulario);
  }
}

export async function createFormulario(input: any) {
  return addToLocal(localDB.formularios, input, '/api/formularios', (data) => ({
    ...data,
    idFormulario: crypto.randomUUID(), // provisional
    active: boolToNum(true),
    fechaRegistro: data.fechaRegistro || new Date().toISOString().slice(0,10),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updateFormulario(idFormulario: string, input: any) {
  await updateLocal(localDB.formularios, idFormulario, input, `/api/formularios/${idFormulario}`, (data) => data);
}

export async function deleteFormulario(idFormulario: string) {
  await deleteLocal(localDB.formularios, idFormulario, `/api/formularios/${idFormulario}`);
}

// ── Macros ────────────────────────────────────────────────

export async function getMacros(): Promise<Macros[]> {
  if (!navigator.onLine) return localDB.macros.toArray();
  try {
    const data = await apiFetch('/api/macros');
    await localDB.macros.clear();
    const localData = data.map((m: any) => toLocal(m, true, { 
      idMacro: m.id_macro,
      idFormulario: m.id_formulario,
      Calories: m.calories
    }));
    await localDB.macros.bulkPut(localData);
    return localData as Macros[];
  } catch {
    return localDB.macros.toArray();
  }
}

export async function getMacro(idMacro: string): Promise<Macros | undefined> {
  if (!navigator.onLine) return localDB.macros.get(idMacro);
  try {
    const data = await apiFetch(`/api/macros/${idMacro}`);
    // Mapeo de "id_macro" a "idMacro"
    const localData = toLocal(data, true, { idMacro: data.id_macro });
    await localDB.macros.put(localData);
    return localData as Macros;
  } catch (error) {
    console.warn(`No se pudo obtener los macros ${idMacro} del servidor.`);
    return localDB.macros.get(idMacro);
  }
}

export async function createMacros(input: any) {
  return addToLocal(localDB.macros, input, '/api/macros', (data) => ({
    ...data,
    idMacro: crypto.randomUUID(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updateMacros(idMacro: string, input: any) {
  await updateLocal(localDB.macros, idMacro, input, `/api/macros/${idMacro}`, (data) => data);
}

export async function deleteMacros(idMacro: string) {
  await deleteLocal(localDB.macros, idMacro, `/api/macros/${idMacro}`);
}

// ── DayliTrack ────────────────────────────────────────────

export async function getDayliTracks(): Promise<DayliTrack[]> {
  if (!navigator.onLine) return localDB.dayliTracks.toArray();
  try {
    const data = await apiFetch('/api/dayli-tracks');
    await localDB.dayliTracks.clear();
    const localData = data.map((dt: any) => toLocal(dt, true, { 
      idDayliTrack: dt.id_dayli_track,
      idMacro: dt.id_macro,
      caloriesCount: dt.calories_count,
      dateTrack: dt.date_track
    }));
    await localDB.dayliTracks.bulkPut(localData);
    return localData as DayliTrack[];
  } catch {
    return localDB.dayliTracks.toArray();
  }
}

export async function getDayliTrack(idDayliTrack: string): Promise<DayliTrack | undefined> {
  if (!navigator.onLine) return localDB.dayliTracks.get(idDayliTrack);
  try {
    const data = await apiFetch(`/api/dayli-tracks/${idDayliTrack}`);
    const localData = toLocal(data, true, { 
      idDayliTrack: data.id_dayli_track,
      idMacro: data.id_macro,
      caloriesCount: data.calories_count,
      dateTrack: data.date_track
    });
    await localDB.dayliTracks.put(localData);
    return localData as DayliTrack;
  } catch (error) {
    console.warn(`No se pudo obtener el daily track ${idDayliTrack} del servidor.`);
    return localDB.dayliTracks.get(idDayliTrack);
  }
}

export async function createDayliTrack(input: any) {
  return addToLocal(localDB.dayliTracks, input, '/api/dayli-tracks', (data) => ({
    ...data,
    idDayliTrack: crypto.randomUUID(),
    dateTrack: data.dateTrack || new Date().toISOString().slice(0,10),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updateDayliTrack(idDayliTrack: string, input: any) {
  await updateLocal(localDB.dayliTracks, idDayliTrack, input, `/api/dayli-tracks/${idDayliTrack}`, (data) => data);
}

export async function deleteDayliTrack(idDayliTrack: string) {
  await deleteLocal(localDB.dayliTracks, idDayliTrack, `/api/dayli-tracks/${idDayliTrack}`);
}

// ── FoodLog ──────────────────────────────────────────────

export async function getFoodLogs(): Promise<FoodLog[]> {
  if (!navigator.onLine) return localDB.foodLogs.toArray();
  try {
    const data = await apiFetch('/api/food-logs');
    await localDB.foodLogs.clear();
    const localData = data.map((fl: any) => toLocal(fl, true, { 
      idFoodLog: fl.id_food_log,
      idDayliTrack: fl.id_dayli_track,
      typeMeal: fl.type_meal
    }));
    await localDB.foodLogs.bulkPut(localData);
    return localData as FoodLog[];
  } catch {
    return localDB.foodLogs.toArray();
  }
}

export async function getFoodLog(idFoodLog: string): Promise<FoodLog | undefined> {
  if (!navigator.onLine) return localDB.foodLogs.get(idFoodLog);
  try {
    const data = await apiFetch(`/api/food-logs/${idFoodLog}`);
    const localData = toLocal(data, true, { 
      idFoodLog: data.id_food_log,
      idDayliTrack: data.id_dayli_track,
      typeMeal: data.type_meal
    });
    await localDB.foodLogs.put(localData);
    return localData as FoodLog;
  } catch (error) {
    console.warn(`No se pudo obtener el food log ${idFoodLog} del servidor.`);
    return localDB.foodLogs.get(idFoodLog);
  }
}

export async function createFoodLog(input: any) {
  return addToLocal(localDB.foodLogs, input, '/api/food-logs', (data) => ({
    ...data,
    idFoodLog: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updateFoodLog(idFoodLog: string, input: any) {
  await updateLocal(localDB.foodLogs, idFoodLog, input, `/api/food-logs/${idFoodLog}`, (data) => data);
}

export async function deleteFoodLog(idFoodLog: string) {
  await deleteLocal(localDB.foodLogs, idFoodLog, `/api/food-logs/${idFoodLog}`);
}