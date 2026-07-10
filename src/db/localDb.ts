import Dexie,  { type Table} from 'dexie';

export interface Area {
  id?: number;
  nombre: string;
  descripcion: string;
  estado: number;
  created_at: string; // ISO string
  _sincronizado?: number; // para marcar si ya está en el servidor
  _ultimaModificacion?: string;
}

export interface Proyecto {
  id?: number;
  id_area: number;
  nombre: string;
  descripcion: string;
  meta: string;
  fecha_inicio: string;       // ISO date
  fecha_fin_planeado: string;
  fecha_fin_real?: string | null;
  estado: number;             // 0 o 1
  created_at: string;
  _sincronizado: number;
  _ultimaModificacion?: string;
}

export interface Metrica {
  id?: number;
  id_area: number;
  nombre: string;
  descripcion: string;
  schema_esperado: string;     // JSON string
  resultados_esperado?: string | null;
  points: number;
  estado: number;              // 0 o 1
  created_at: string;
  _sincronizado: number;
  _ultimaModificacion?: string;
}

export interface ProyectoMetrica {
  id?: number;
  id_proyecto: number;
  id_metrica: number;
  config_programacion: string; // JSON string
  activo: number;              // 0 o 1
  created_at: string;
  _sincronizado: number;
  _ultimaModificacion?: string;
}

export interface RegistroEvaluacion {
  id?: number;
  id_proyecto_metrica: number;
  fecha_evaluacion: string;   // ISO
  valores: string;            // JSON
  notas?: string;
  created_at: string;
  _sincronizado: number;
  _ultimaModificacion?: string;
}

export interface Reward {
  id?: number;
  reward: string;
  points_need: number;
  description: string;
  estado: number;             // 0 o 1
  created_at?: string;        // asumimos que existe
  _sincronizado: number;
  _ultimaModificacion?: string;
}

export interface PuntosUsados {
  id?: number;
  id_reward: number;
  reclaim_date: string;       // ISO
  _sincronizado: number;
  _ultimaModificacion?: string;
}

export interface Task {
  id?: number;
  taskname: string;
  description?: string;
  due_date?: string | null;
  status: string;             // "do", "doing", "done"
  points: number;
  created_at: string;
  _sincronizado: number;
  _ultimaModificacion?: string;
}

export interface PuntosGanados {
  id?: number;
  id_registro_evaluacion?: number | null;
  id_task?: number | null;
  points: number;
  fecha_registro: string;     // ISO
  _sincronizado: number;
  _ultimaModificacion?: string;
}

export interface PointReview {
  id: number;
  total_puntos: number;
  _ultimaModificacion?: string;
}

export interface Formulario {
  idFormulario: string;       // UUID (PK, no auto‑increment)
  gender?: string;
  edad?: number;
  peso?: number;
  altura?: number;
  nivelActividad?: number;
  cuello?: number;
  cintura?: number;
  cadera?: number;
  meta?: string;
  velocidadKgSemana?: number;
  fechaRegistro?: string;     // "YYYY-MM-DD"
  active: number;             // 0 o 1
  _sincronizado: number;
  _ultimaModificacion?: string;
}

export interface Macros {
  idMacro: string;            // UUID (PK)
  idFormulario: string;
  Calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  water?: number;
  _sincronizado: number;
  _ultimaModificacion?: string;
}

export interface DayliTrack {
  idDayliTrack: string;       // UUID (PK)
  idMacro?: string | null;
  caloriesCount?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  water?: number;
  dateTrack?: string;         // "YYYY-MM-DD"
  _sincronizado: number;
  _ultimaModificacion?: string;
}

export interface FoodLog {
  idFoodLog: string;          // UUID (PK)
  idDayliTrack: string;
  type_meal?: string;         // "breakfast", "lunch", "dinner", "snack"
  food?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  created_at: string;
  _sincronizado: number;
  _ultimaModificacion?: string;
}

export interface PendingOperation {
  id?: number;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  endpoint: string; // p.ej. '/api/areas'
  payload: any;
  timestamp: string; // ISO
  localId?: string | number;
  tableName?: string;
}

class TrackerDB extends Dexie {
  areas!: Table<Area, number>;
  proyectos!: Table<Proyecto, number>;
  metricas!: Table<Metrica, number>;
  proyecto_metricas!: Table<ProyectoMetrica, number>;
  registro_evaluaciones!: Table<RegistroEvaluacion, number>;
  rewards!: Table<Reward, number>;
  puntos_usados!: Table<PuntosUsados, number>;
  tasks!: Table<Task, number>;
  puntos_ganados!: Table<PuntosGanados, number>;
  formularios!: Table<Formulario, string>;      // PK string (UUID)
  macros!: Table<Macros, string>;               // PK string
  dayliTracks!: Table<DayliTrack, string>;      // PK string
  foodLogs!: Table<FoodLog, string>;            // PK string
  pendingSync!: Table<PendingOperation, number>;
  point_review!: Table<PointReview, number>;

  constructor() {
    super('TrackerOfflineDB');
    this.version(1).stores({
      areas:                  '++id, _sincronizado, estado',
      proyectos:              '++id, id_area, _sincronizado, estado',
      metricas:               '++id, id_area, _sincronizado, estado',
      proyecto_metricas:      '++id, id_proyecto, id_metrica, _sincronizado, activo',
      registro_evaluaciones:  '++id, id_proyecto_metrica, _sincronizado',
      rewards:                '++id, _sincronizado, estado',
      puntos_usados:          '++id, id_reward, _sincronizado',
      tasks:                  '++id, status, _sincronizado',
      puntos_ganados:         '++id, _sincronizado',
      formularios:            '&idFormulario, active, _sincronizado',   // & para clave primaria string
      macros:                 '&idMacro, idFormulario, _sincronizado',
      dayliTracks:            '&idDayliTrack, idMacro, dateTrack, _sincronizado',
      foodLogs:               '&idFoodLog, idDayliTrack, type_meal, _sincronizado',
      pendingSync:            '++id, timestamp',
      point_review:           'id',
    });
  }
}

export const localDB = new TrackerDB();

export const boolToNum = (b: boolean): number => (b ? 1 : 0);
export const numToBool = (n: number): boolean => n === 1;