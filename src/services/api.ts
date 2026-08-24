import { localDB, boolToNum, numToBool } from '../db/localDb';
import type {
  Area, Proyecto, Metrica, ProyectoMetrica, RegistroEvaluacion,
  Reward, PuntosUsados, Task, PuntosGanados, Formulario,
  Macros, DayliTrack, FoodLog,
  ProyectoHabito, ProyectoTarea, RegistroHabito, RegistroTarea,
  Medio, CategoriaFinanzas, Movimiento,
  EgresoFijo, PagoProgramado, Presupuesto, AlertaPago
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


async function safeBulkReplace<T>(table: any, serverData: any[], toLocalMapper?: (item: any) => any): Promise<T[]> {
  const syncedIds = await table.filter((r: any) => r._sincronizado === 1).primaryKeys();
  await table.bulkDelete(syncedIds);
  const localData = serverData.map((item: any) => toLocalMapper ? toLocalMapper(item) : toLocal(item, true));
  await table.bulkPut(localData);
  return localData as T[];
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
    return await safeBulkReplace(localDB.areas, data);
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
    return await safeBulkReplace(localDB.proyectos, data);
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
    return await safeBulkReplace(localDB.metricas, data);
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
    return await safeBulkReplace(localDB.proyecto_metricas, data);
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
    return await safeBulkReplace(localDB.registro_evaluaciones, data);
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
    return await safeBulkReplace(localDB.rewards, data);
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
    return await safeBulkReplace(localDB.puntos_usados, data);
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
    return await safeBulkReplace(localDB.tasks, data);
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
    return await safeBulkReplace(localDB.puntos_ganados, data);
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
    const data = await apiFetch('/api/point-review');
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
    return await safeBulkReplace(localDB.formularios, data, (item) => toLocal(item, true, {
      idFormulario: item.id_formulario,
      active: boolToNum(item.active),
      velocidadKgSemana: item.velocidadKgSemana !== undefined ? item.velocidadKgSemana : item.velocidad_kg_semana,
      fechaRegistro: item.fechaRegistro !== undefined ? item.fechaRegistro : item.fecha_registro,
      nivelActividad: item.nivelActividad !== undefined ? item.nivelActividad : item.nivel_actividad
    }));
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
    return await safeBulkReplace(localDB.macros, data, (item) => toLocal(item, true, { 
      idMacro: item.id_macro,
      idFormulario: item.id_formulario,
      Calories: item.calories
    }));
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
    return await safeBulkReplace(localDB.dayliTracks, data, (item) => toLocal(item, true, { 
      idDayliTrack: item.id_dayli_track,
      idMacro: item.id_macro,
      caloriesCount: item.calories_count,
      dateTrack: item.date_track
    }));
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
    return await safeBulkReplace(localDB.foodLogs, data, (item) => toLocal(item, true, { 
      idFoodLog: item.id_food_log,
      idDayliTrack: item.id_dayli_track,
      type_meal: item.type_meal || item.typeMeal
    }));
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

// ─── ProyectoHabito ───────────────────────────────────────

export async function getProyectoHabitos(): Promise<ProyectoHabito[]> {
  if (!navigator.onLine) return localDB.proyecto_habitos.toArray();
  try {
    const data = await apiFetch('/api/proyecto-habitos');
    return await safeBulkReplace(localDB.proyecto_habitos, data);
  } catch {
    return localDB.proyecto_habitos.toArray();
  }
}

export async function getProyectoHabito(id: number): Promise<ProyectoHabito | undefined> {
  if (!navigator.onLine) return localDB.proyecto_habitos.get(id);
  try {
    const data = await apiFetch(`/api/proyecto-habitos/${id}`);
    const localData = toLocal(data, true);
    await localDB.proyecto_habitos.put(localData);
    return localData as ProyectoHabito;
  } catch {
    return localDB.proyecto_habitos.get(id);
  }
}

export async function createProyectoHabito(input: any) {
  const processed = {
    ...input,
    dias_semana: typeof input.dias_semana === 'string' ? input.dias_semana : JSON.stringify(input.dias_semana),
  };
  return addToLocal(localDB.proyecto_habitos, processed, '/api/proyecto-habitos', (data) => ({
    ...data,
    record_streak: 0,
    best_streak: 0,
    activo: boolToNum(true),
    created_at: new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updateProyectoHabito(id: number, input: any) {
  const processed = {
    ...input,
    dias_semana: input.dias_semana ? (typeof input.dias_semana === 'string' ? input.dias_semana : JSON.stringify(input.dias_semana)) : undefined,
  };
  await updateLocal(localDB.proyecto_habitos, id, processed, `/api/proyecto-habitos/${id}`, (data) => data);
}

export async function deleteProyectoHabito(id: number) {
  await deleteLocal(localDB.proyecto_habitos, id, `/api/proyecto-habitos/${id}`);
}

// ─── ProyectoTarea ────────────────────────────────────────

export async function getProyectoTareas(): Promise<ProyectoTarea[]> {
  if (!navigator.onLine) return localDB.proyecto_tareas.toArray();
  try {
    const data = await apiFetch('/api/proyecto-tareas');
    return await safeBulkReplace(localDB.proyecto_tareas, data);
  } catch {
    return localDB.proyecto_tareas.toArray();
  }
}

export async function getProyectoTarea(id: number): Promise<ProyectoTarea | undefined> {
  if (!navigator.onLine) return localDB.proyecto_tareas.get(id);
  try {
    const data = await apiFetch(`/api/proyecto-tareas/${id}`);
    const localData = toLocal(data, true);
    await localDB.proyecto_tareas.put(localData);
    return localData as ProyectoTarea;
  } catch {
    return localDB.proyecto_tareas.get(id);
  }
}

export async function createProyectoTarea(input: any) {
  return addToLocal(localDB.proyecto_tareas, input, '/api/proyecto-tareas', (data) => ({
    ...data,
    activo: boolToNum(true),
    created_at: new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updateProyectoTarea(id: number, input: any) {
  await updateLocal(localDB.proyecto_tareas, id, input, `/api/proyecto-tareas/${id}`, (data) => data);
}

export async function deleteProyectoTarea(id: number) {
  await deleteLocal(localDB.proyecto_tareas, id, `/api/proyecto-tareas/${id}`);
}

// ─── RegistroHabito ───────────────────────────────────────

export async function getRegistroHabitos(): Promise<RegistroHabito[]> {
  if (!navigator.onLine) return localDB.registro_habitos.toArray();
  try {
    const data = await apiFetch('/api/registro-habitos');
    return await safeBulkReplace(localDB.registro_habitos, data);
  } catch {
    return localDB.registro_habitos.toArray();
  }
}

export async function createRegistroHabito(input: any) {
  return addToLocal(localDB.registro_habitos, input, '/api/registro-habitos', (data) => ({
    ...data,
    completado: boolToNum(data.completado || false),
    points_ganados: data.points_ganados || 0,
    streak_actual: data.streak_actual || 0,
    created_at: new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updateRegistroHabito(id: number, input: any) {
  await updateLocal(localDB.registro_habitos, id, input, `/api/registro-habitos/${id}`, (data) => ({
    ...data,
    completado: typeof data.completado === 'boolean' ? boolToNum(data.completado) : data.completado,
  }));
}

export async function deleteRegistroHabito(id: number) {
  await deleteLocal(localDB.registro_habitos, id, `/api/registro-habitos/${id}`);
}

// ─── RegistroTarea ────────────────────────────────────────

export async function getRegistroTareas(): Promise<RegistroTarea[]> {
  if (!navigator.onLine) return localDB.registro_tareas.toArray();
  try {
    const data = await apiFetch('/api/registro-tareas');
    return await safeBulkReplace(localDB.registro_tareas, data);
  } catch {
    return localDB.registro_tareas.toArray();
  }
}

export async function createRegistroTarea(input: any) {
  return addToLocal(localDB.registro_tareas, input, '/api/registro-tareas', (data) => ({
    ...data,
    completado: boolToNum(data.completado || false),
    created_at: new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updateRegistroTarea(id: number, input: any) {
  await updateLocal(localDB.registro_tareas, id, input, `/api/registro-tareas/${id}`, (data) => ({
    ...data,
    completado: typeof data.completado === 'boolean' ? boolToNum(data.completado) : data.completado,
  }));
}

export async function deleteRegistroTarea(id: number) {
  await deleteLocal(localDB.registro_tareas, id, `/api/registro-tareas/${id}`);
}

// ─── Medios & Saldos ──────────────────────────────────────

export async function getMedios(): Promise<Medio[]> {
  if (!navigator.onLine) return localDB.medios.toArray();
  try {
    const data = await apiFetch('/api/medios');
    return await safeBulkReplace(localDB.medios, data, (item) => toLocal(item, true, {
      id: item.id,
      estado: boolToNum(item.estado ?? true),
      saldo_actual: Number(item.saldo_actual || 0)
    }));
  } catch {
    return localDB.medios.toArray();
  }
}

export async function getMedio(id: string): Promise<Medio | undefined> {
  if (!navigator.onLine) return localDB.medios.get(id);
  try {
    const data = await apiFetch(`/api/medios/${id}`);
    const localData = toLocal(data, true, {
      id: data.id,
      estado: boolToNum(data.estado ?? true),
      saldo_actual: Number(data.saldo_actual || 0)
    });
    await localDB.medios.put(localData);
    return localData as Medio;
  } catch {
    return localDB.medios.get(id);
  }
}

export async function createMedio(input: any) {
  const newId = crypto.randomUUID();
  const saldoInicial = Number(input.saldo_inicial || 0);

  const res = await addToLocal(localDB.medios, { ...input, id: newId }, '/api/medios', (data) => ({
    ...data,
    id: data.id || newId,
    estado: boolToNum(true),
    saldo_actual: saldoInicial,
    created_at: new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));

  // Inicializar saldo en tabla saldos_actuales
  await localDB.saldos_actuales.put({
    id: crypto.randomUUID(),
    medio_id: typeof res === 'string' ? res : newId,
    saldo: saldoInicial,
    _sincronizado: 1,
    _ultimaModificacion: new Date().toISOString()
  });

  return res;
}

export async function updateMedio(id: string, input: any) {
  await updateLocal(localDB.medios, id, input, `/api/medios/${id}`, (data) => ({
    ...data,
    estado: typeof data.estado === 'boolean' ? boolToNum(data.estado) : data.estado
  }));
}

export async function setSaldoMedio(id: string, saldo: number) {
  const medio = await localDB.medios.get(id);
  if (medio) {
    await localDB.medios.update(id, { saldo_actual: saldo });
  }
  const saldoRec = await localDB.saldos_actuales.filter(s => s.medio_id === id).first();
  if (saldoRec) {
    await localDB.saldos_actuales.update(saldoRec.id, { saldo });
  } else {
    await localDB.saldos_actuales.put({ id: crypto.randomUUID(), medio_id: id, saldo, _sincronizado: 1 });
  }

  if (navigator.onLine) {
    try {
      await apiFetch(`/api/medios/${id}/saldo`, {
        method: 'PUT',
        body: JSON.stringify({ saldo })
      });
    } catch {
      await localDB.pendingSync.add({
        type: 'UPDATE',
        endpoint: `/api/medios/${id}/saldo`,
        payload: { saldo },
        timestamp: new Date().toISOString()
      });
    }
  } else {
    await localDB.pendingSync.add({
      type: 'UPDATE',
      endpoint: `/api/medios/${id}/saldo`,
      payload: { saldo },
      timestamp: new Date().toISOString()
    });
  }
}

export async function deleteMedio(id: string) {
  await deleteLocal(localDB.medios, id, `/api/medios/${id}`);
}

// ─── Categorias Finanzas ─────────────────────────────────

export async function getCategoriasFinanzas(): Promise<CategoriaFinanzas[]> {
  if (!navigator.onLine) return localDB.categorias_finanzas.toArray();
  try {
    const data = await apiFetch('/api/categorias');
    return await safeBulkReplace(localDB.categorias_finanzas, data, (item) => toLocal(item, true, { id: item.id }));
  } catch {
    return localDB.categorias_finanzas.toArray();
  }
}

export async function createCategoriaFinanzas(input: any) {
  const newId = crypto.randomUUID();
  return addToLocal(localDB.categorias_finanzas, { ...input, id: newId }, '/api/categorias', (data) => ({
    ...data,
    id: data.id || newId,
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updateCategoriaFinanzas(id: string, input: any) {
  await updateLocal(localDB.categorias_finanzas, id, input, `/api/categorias/${id}`, (data) => data);
}

export async function deleteCategoriaFinanzas(id: string) {
  await deleteLocal(localDB.categorias_finanzas, id, `/api/categorias/${id}`);
}

// ─── Movimientos (Con ajuste de saldo reactivo) ───────────

export async function getMovimientos(): Promise<Movimiento[]> {
  if (!navigator.onLine) return localDB.movimientos.toArray();
  try {
    const data = await apiFetch('/api/movimientos');
    return await safeBulkReplace(localDB.movimientos, data, (item) => toLocal(item, true, {
      id: item.id,
      monto: Number(item.monto || 0)
    }));
  } catch {
    return localDB.movimientos.toArray();
  }
}

export async function createMovimiento(input: any) {
  const newId = crypto.randomUUID();
  const monto = Number(input.monto);
  const tipo = input.tipo as 'I' | 'E';
  const medioId = input.medio_id;

  // Ajuste optimista del saldo local
  const medio = await localDB.medios.get(medioId);
  if (medio) {
    const delta = tipo === 'I' ? monto : -monto;
    const nuevoSaldo = (medio.saldo_actual || 0) + delta;
    await localDB.medios.update(medioId, { saldo_actual: nuevoSaldo });
  }

  return addToLocal(localDB.movimientos, { ...input, id: newId }, '/api/movimientos', (data) => ({
    ...data,
    id: data.id || newId,
    monto,
    fecha_movimiento: data.fecha_movimiento || new Date().toISOString(),
    created_at: new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updateMovimiento(id: string, input: any) {
  const oldMov = await localDB.movimientos.get(id);
  const newMonto = Number(input.monto);
  const newTipo = input.tipo as 'I' | 'E';
  const newMedioId = input.medio_id;

  if (oldMov) {
    // 1. Revertir impacto anterior
    const oldMedio = await localDB.medios.get(oldMov.medio_id);
    if (oldMedio) {
      const revertDelta = oldMov.tipo === 'I' ? -oldMov.monto : oldMov.monto;
      await localDB.medios.update(oldMov.medio_id, { saldo_actual: (oldMedio.saldo_actual || 0) + revertDelta });
    }
    // 2. Aplicar nuevo impacto
    const targetMedio = await localDB.medios.get(newMedioId);
    if (targetMedio) {
      const applyDelta = newTipo === 'I' ? newMonto : -newMonto;
      await localDB.medios.update(newMedioId, { saldo_actual: (targetMedio.saldo_actual || 0) + applyDelta });
    }
  }

  await updateLocal(localDB.movimientos, id, input, `/api/movimientos/${id}`, (data) => ({
    ...data,
    monto: newMonto
  }));
}

export async function deleteMovimiento(id: string) {
  const oldMov = await localDB.movimientos.get(id);
  if (oldMov) {
    const medio = await localDB.medios.get(oldMov.medio_id);
    if (medio) {
      const revertDelta = oldMov.tipo === 'I' ? -oldMov.monto : oldMov.monto;
      await localDB.medios.update(oldMov.medio_id, { saldo_actual: (medio.saldo_actual || 0) + revertDelta });
    }
  }
  await deleteLocal(localDB.movimientos, id, `/api/movimientos/${id}`);
}

// ─── Egresos Fijos ────────────────────────────────────────

export async function getEgresosFijos(): Promise<EgresoFijo[]> {
  if (!navigator.onLine) return localDB.egresos_fijos.toArray();
  try {
    const data = await apiFetch('/api/egresos-fijos');
    return await safeBulkReplace(localDB.egresos_fijos, data, (item) => toLocal(item, true, {
      id: item.id,
      activo: boolToNum(item.activo ?? true),
      monto: Number(item.monto || 0)
    }));
  } catch {
    return localDB.egresos_fijos.toArray();
  }
}

export async function createEgresoFijo(input: any) {
  const newId = crypto.randomUUID();
  const processed = {
    ...input,
    id: newId,
    monto: Number(input.monto),
    programacion_pago: typeof input.programacion_pago === 'string' ? input.programacion_pago : JSON.stringify(input.programacion_pago),
    recordatorio_dias_antes: Number(input.recordatorio_dias_antes || 3),
  };

  const res = await addToLocal(localDB.egresos_fijos, processed, '/api/egresos-fijos', (data) => ({
    ...data,
    id: data.id || newId,
    activo: boolToNum(true),
    created_at: new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));

  // Refrescar pagos programados y alertas en background
  if (navigator.onLine) {
    getPagosProgramados().catch(console.error);
    getAlertasPago().catch(console.error);
  }

  return res;
}

export async function updateEgresoFijo(id: string, input: any) {
  const processed = {
    ...input,
    monto: input.monto ? Number(input.monto) : undefined,
    programacion_pago: input.programacion_pago ? (typeof input.programacion_pago === 'string' ? input.programacion_pago : JSON.stringify(input.programacion_pago)) : undefined,
  };
  await updateLocal(localDB.egresos_fijos, id, processed, `/api/egresos-fijos/${id}`, (data) => ({
    ...data,
    activo: typeof data.activo === 'boolean' ? boolToNum(data.activo) : data.activo
  }));
}

export async function deleteEgresoFijo(id: string) {
  await deleteLocal(localDB.egresos_fijos, id, `/api/egresos-fijos/${id}`);
}

// ─── Pagos Programados ────────────────────────────────────

export async function getPagosProgramados(): Promise<PagoProgramado[]> {
  if (!navigator.onLine) return localDB.pagos_programados.toArray();
  try {
    const data = await apiFetch('/api/pagos-programados');
    return await safeBulkReplace(localDB.pagos_programados, data, (item) => toLocal(item, true, {
      id: item.id,
      monto_esperado: Number(item.monto_esperado || 0)
    }));
  } catch {
    return localDB.pagos_programados.toArray();
  }
}

export async function pagarPagoProgramado(pagoId: string, payload: { medio_id: string; monto_real: number; notas?: string }) {
  const pago = await localDB.pagos_programados.get(pagoId);
  const monto = Number(payload.monto_real);

  // 1. Actualizar estado local del pago programado
  if (pago) {
    await localDB.pagos_programados.update(pagoId, {
      estado: 'pagado',
      fecha_pago: new Date().toISOString(),
      medio_id: payload.medio_id,
      notas: payload.notas || null
    });
  }

  // 2. Crear movimiento local de egreso
  const egresoFijo = pago ? await localDB.egresos_fijos.get(pago.egreso_fijo_id) : null;
  const movId = crypto.randomUUID();
  const desc = egresoFijo ? `Pago programado: ${egresoFijo.razon}` : 'Pago programado';

  await createMovimiento({
    id: movId,
    medio_id: payload.medio_id,
    categoria_id: egresoFijo?.categoria_id || null,
    tipo: 'E',
    fecha_movimiento: new Date().toISOString(),
    descripcion: payload.notas ? `${desc} - ${payload.notas}` : desc,
    monto,
    egreso_fijo_id: pago?.egreso_fijo_id || null
  });

  // 3. Marcar alerta asociada como leída
  const alerta = await localDB.alertas_pago.filter(a => a.pago_programado_id === pagoId).first();
  if (alerta) {
    await localDB.alertas_pago.update(alerta.id, { leida: 1 });
  }

  // 4. Mandar al servidor si estamos online
  if (navigator.onLine) {
    try {
      await apiFetch(`/api/pagos-programados/${pagoId}/pagar`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch {
      await localDB.pendingSync.add({
        type: 'UPDATE',
        endpoint: `/api/pagos-programados/${pagoId}/pagar`,
        payload,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    await localDB.pendingSync.add({
      type: 'UPDATE',
      endpoint: `/api/pagos-programados/${pagoId}/pagar`,
      payload,
      timestamp: new Date().toISOString()
    });
  }
}

export async function deletePagoProgramado(id: string) {
  await deleteLocal(localDB.pagos_programados, id, `/api/pagos-programados/${id}`);
}

// ─── Presupuestos ─────────────────────────────────────────

export async function getPresupuestos(): Promise<Presupuesto[]> {
  if (!navigator.onLine) return localDB.presupuestos.toArray();
  try {
    const data = await apiFetch('/api/presupuestos');
    return await safeBulkReplace(localDB.presupuestos, data, (item) => toLocal(item, true, {
      id: item.id,
      activo: boolToNum(item.activo ?? true),
      monto_limite: Number(item.monto_limite || 0)
    }));
  } catch {
    return localDB.presupuestos.toArray();
  }
}

export async function createPresupuesto(input: any) {
  const newId = crypto.randomUUID();
  return addToLocal(localDB.presupuestos, { ...input, id: newId }, '/api/presupuestos', (data) => ({
    ...data,
    id: data.id || newId,
    monto_limite: Number(data.monto_limite),
    activo: boolToNum(true),
    created_at: new Date().toISOString(),
    _sincronizado: 0,
    _ultimaModificacion: new Date().toISOString(),
  }));
}

export async function updatePresupuesto(id: string, input: any) {
  await updateLocal(localDB.presupuestos, id, input, `/api/presupuestos/${id}`, (data) => ({
    ...data,
    monto_limite: input.monto_limite ? Number(input.monto_limite) : data.monto_limite,
    activo: typeof data.activo === 'boolean' ? boolToNum(data.activo) : data.activo
  }));
}

export async function deletePresupuesto(id: string) {
  await deleteLocal(localDB.presupuestos, id, `/api/presupuestos/${id}`);
}

// ─── Alertas de Pago ──────────────────────────────────────

export async function getAlertasPago(): Promise<AlertaPago[]> {
  if (!navigator.onLine) return localDB.alertas_pago.toArray();
  try {
    const data = await apiFetch('/api/alertas-pago');
    return await safeBulkReplace(localDB.alertas_pago, data, (item) => toLocal(item, true, {
      id: item.id,
      leida: boolToNum(item.leida ?? false)
    }));
  } catch {
    return localDB.alertas_pago.toArray();
  }
}

export async function marcarAlertaLeida(id: string, leida: boolean) {
  await localDB.alertas_pago.update(id, { leida: boolToNum(leida) });

  if (navigator.onLine) {
    try {
      await apiFetch(`/api/alertas-pago/${id}/leida`, {
        method: 'PUT',
        body: JSON.stringify({ leida })
      });
    } catch {
      await localDB.pendingSync.add({
        type: 'UPDATE',
        endpoint: `/api/alertas-pago/${id}/leida`,
        payload: { leida },
        timestamp: new Date().toISOString()
      });
    }
  } else {
    await localDB.pendingSync.add({
      type: 'UPDATE',
      endpoint: `/api/alertas-pago/${id}/leida`,
      payload: { leida },
      timestamp: new Date().toISOString()
    });
  }
}

export async function deleteAlertaPago(id: string) {
  await deleteLocal(localDB.alertas_pago, id, `/api/alertas-pago/${id}`);
}