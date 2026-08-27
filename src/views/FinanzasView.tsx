import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, type Medio, type Movimiento, type EgresoFijo, type PagoProgramado, type Presupuesto } from '../db/localDb';
import {
  getMedios, createMedio, updateMedio, setSaldoMedio, deleteMedio,
  getCategoriasFinanzas, createCategoriaFinanzas, deleteCategoriaFinanzas,
  getMovimientos, createMovimiento, updateMovimiento, deleteMovimiento,
  getEgresosFijos, createEgresoFijo, updateEgresoFijo, deleteEgresoFijo,
  getPagosProgramados, pagarPagoProgramado,
  getPresupuestos, createPresupuesto, updatePresupuesto, deletePresupuesto
} from '../services/api';
import {
  Wallet, ArrowDownRight, ArrowUpRight, Plus, Trash2, Edit2,
  Calendar, DollarSign, Search, X, CheckCircle2,
  CreditCard, Banknote, RefreshCw, PieChart, Layers, Loader2
} from 'lucide-react';
import './FinanzasView.css';

export function FinanzasView() {
  const [activeTab, setActiveTab] = useState<'movimientos' | 'medios' | 'egresos_fijos' | 'presupuestos' | 'categorias'>('movimientos');

  // Datos reactivos de Dexie
  const medios = useLiveQuery(() => localDB.medios.filter(m => m.estado === 1).toArray(), []) || [];
  const categorias = useLiveQuery(() => localDB.categorias_finanzas.toArray(), []) || [];
  const movimientos = useLiveQuery(async () => {
    const list = await localDB.movimientos.toArray();
    return list.sort((a, b) => (b.fecha_movimiento || '').localeCompare(a.fecha_movimiento || ''));
  }, []) || [];
  const egresosFijos = useLiveQuery(() => localDB.egresos_fijos.filter(ef => ef.activo === 1).toArray(), []) || [];
  const pagosProgramados = useLiveQuery(async () => {
    const list = await localDB.pagos_programados.toArray();
    return list.sort((a, b) => (a.fecha_programada || '').localeCompare(b.fecha_programada || ''));
  }, []) || [];
  const presupuestos = useLiveQuery(() => localDB.presupuestos.filter(p => p.activo === 1).toArray(), []) || [];

  // Descarga / Sincronización al montar
  useEffect(() => {
    if (navigator.onLine) {
      Promise.all([
        getMedios(),
        getCategoriasFinanzas(),
        getMovimientos(),
        getEgresosFijos(),
        getPagosProgramados(),
        getPresupuestos()
      ]).catch(console.error);
    }
  }, []);

  // ── Totales Generales ──
  const saldoTotal = useMemo(() => {
    return medios.reduce((sum, m) => sum + (m.saldo_actual || 0), 0);
  }, [medios]);

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const ingresosMes = useMemo(() => {
    return movimientos
      .filter(m => m.tipo === 'I' && (m.fecha_movimiento || '').startsWith(currentMonthStr))
      .reduce((sum, m) => sum + m.monto, 0);
  }, [movimientos, currentMonthStr]);

  const egresosMes = useMemo(() => {
    return movimientos
      .filter(m => m.tipo === 'E' && (m.fecha_movimiento || '').startsWith(currentMonthStr))
      .reduce((sum, m) => sum + m.monto, 0);
  }, [movimientos, currentMonthStr]);

  // ── Filtros de Movimientos ──
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTipo, setFilterTipo] = useState<string>('todos');
  const [filterMedio, setFilterMedio] = useState<string>('todos');
  const [filterCategoria, setFilterCategoria] = useState<string>('todos');

  const filteredMovimientos = useMemo(() => {
    return movimientos.filter(m => {
      if (filterTipo !== 'todos' && m.tipo !== filterTipo) return false;
      if (filterMedio !== 'todos' && m.medio_id !== filterMedio) return false;
      if (filterCategoria !== 'todos' && m.categoria_id !== filterCategoria) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const desc = (m.descripcion || '').toLowerCase();
        if (!desc.includes(q)) return false;
      }
      return true;
    });
  }, [movimientos, filterTipo, filterMedio, filterCategoria, searchQuery]);

  // ── Modales y Formularios ──

  // Modal Movimiento
  const [isMovModalOpen, setIsMovModalOpen] = useState(false);
  const [editingMov, setEditingMov] = useState<Movimiento | null>(null);
  const [isSavingMov, setIsSavingMov] = useState(false);
  const [movForm, setMovForm] = useState({
    medio_id: '',
    categoria_id: '',
    tipo: 'E' as 'I' | 'E',
    monto: '',
    fecha_movimiento: new Date().toISOString().slice(0, 10),
    descripcion: ''
  });

  const openMovModal = (m?: Movimiento) => {
    if (m) {
      setEditingMov(m);
      setMovForm({
        medio_id: m.medio_id,
        categoria_id: m.categoria_id || '',
        tipo: m.tipo,
        monto: String(m.monto),
        fecha_movimiento: (m.fecha_movimiento || '').slice(0, 10),
        descripcion: m.descripcion || ''
      });
    } else {
      setEditingMov(null);
      setMovForm({
        medio_id: medios[0]?.id || '',
        categoria_id: categorias[0]?.id || '',
        tipo: 'E',
        monto: '',
        fecha_movimiento: new Date().toISOString().slice(0, 10),
        descripcion: ''
      });
    }
    setIsMovModalOpen(true);
  };

  const handleSaveMov = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingMov || !movForm.medio_id || Number(movForm.monto) <= 0) return;

    setIsSavingMov(true);
    try {
      const payload = {
        medio_id: movForm.medio_id,
        categoria_id: movForm.categoria_id || null,
        tipo: movForm.tipo,
        monto: Number(movForm.monto),
        fecha_movimiento: new Date(movForm.fecha_movimiento).toISOString(),
        descripcion: movForm.descripcion || null
      };

      if (editingMov) {
        await updateMovimiento(editingMov.id, payload);
      } else {
        await createMovimiento(payload);
      }
      setIsMovModalOpen(false);
    } catch (err) {
      console.error('Error guardando movimiento:', err);
      alert('Hubo un error al guardar el movimiento.');
    } finally {
      setIsSavingMov(false);
    }
  };

  // Modal Medio
  const [isMedioModalOpen, setIsMedioModalOpen] = useState(false);
  const [editingMedio, setEditingMedio] = useState<Medio | null>(null);
  const [medioForm, setMedioForm] = useState({
    medio: '',
    tipo_medio: 'cuenta_bancaria',
    numero_cuenta: '',
    banco: '',
    saldo_inicial: '0'
  });

  const openMedioModal = (m?: Medio) => {
    if (m) {
      setEditingMedio(m);
      setMedioForm({
        medio: m.medio,
        tipo_medio: m.tipo_medio,
        numero_cuenta: m.numero_cuenta || '',
        banco: m.banco || '',
        saldo_inicial: String(m.saldo_actual || 0)
      });
    } else {
      setEditingMedio(null);
      setMedioForm({
        medio: '',
        tipo_medio: 'cuenta_bancaria',
        numero_cuenta: '',
        banco: '',
        saldo_inicial: '0'
      });
    }
    setIsMedioModalOpen(true);
  };

  const handleSaveMedio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medioForm.medio.trim()) return;

    if (editingMedio) {
      await updateMedio(editingMedio.id, {
        medio: medioForm.medio.trim(),
        tipo_medio: medioForm.tipo_medio,
        numero_cuenta: medioForm.numero_cuenta || null,
        banco: medioForm.banco || null,
        estado: 1
      });
      if (Number(medioForm.saldo_inicial) !== editingMedio.saldo_actual) {
        await setSaldoMedio(editingMedio.id, Number(medioForm.saldo_inicial));
      }
    } else {
      await createMedio({
        medio: medioForm.medio.trim(),
        tipo_medio: medioForm.tipo_medio,
        numero_cuenta: medioForm.numero_cuenta || null,
        banco: medioForm.banco || null,
        saldo_inicial: Number(medioForm.saldo_inicial) || 0
      });
    }
    setIsMedioModalOpen(false);
  };

  // Modal Ajuste Rápido de Saldo
  const [isSaldoModalOpen, setIsSaldoModalOpen] = useState(false);
  const [selectedMedioForSaldo, setSelectedMedioForSaldo] = useState<Medio | null>(null);
  const [nuevoSaldoInput, setNuevoSaldoInput] = useState('');

  const openSaldoModal = (m: Medio) => {
    setSelectedMedioForSaldo(m);
    setNuevoSaldoInput(String(m.saldo_actual || 0));
    setIsSaldoModalOpen(true);
  };

  const handleSaveSaldo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMedioForSaldo) return;
    await setSaldoMedio(selectedMedioForSaldo.id, Number(nuevoSaldoInput) || 0);
    setIsSaldoModalOpen(false);
  };

  // Modal Egreso Fijo
  const [isEgresoFijoModalOpen, setIsEgresoFijoModalOpen] = useState(false);
  const [editingEgresoFijo, setEditingEgresoFijo] = useState<EgresoFijo | null>(null);
  const [egresoFijoForm, setEgresoFijoForm] = useState({
    razon: '',
    descripcion: '',
    categoria_id: '',
    monto: '',
    frecuencia: 'mensual',
    dia_mes: '15',
    dia_semana: 'lunes',
    recordatorio_dias_antes: '3',
    fecha_inicio: new Date().toISOString().slice(0, 10),
    fecha_fin: ''
  });

  const openEgresoFijoModal = (ef?: EgresoFijo) => {
    if (ef) {
      setEditingEgresoFijo(ef);
      let prog: any = {};
      try {
        prog = typeof ef.programacion_pago === 'string' ? JSON.parse(ef.programacion_pago) : ef.programacion_pago;
      } catch {}
      setEgresoFijoForm({
        razon: ef.razon,
        descripcion: ef.descripcion || '',
        categoria_id: ef.categoria_id || '',
        monto: String(ef.monto),
        frecuencia: prog.frecuencia || 'mensual',
        dia_mes: String(prog.dia_mes || 15),
        dia_semana: prog.dia_semana || 'lunes',
        recordatorio_dias_antes: String(ef.recordatorio_dias_antes || 3),
        fecha_inicio: (ef.fecha_inicio || '').slice(0, 10),
        fecha_fin: ef.fecha_fin ? ef.fecha_fin.slice(0, 10) : ''
      });
    } else {
      setEditingEgresoFijo(null);
      setEgresoFijoForm({
        razon: '',
        descripcion: '',
        categoria_id: categorias[0]?.id || '',
        monto: '',
        frecuencia: 'mensual',
        dia_mes: '15',
        dia_semana: 'lunes',
        recordatorio_dias_antes: '3',
        fecha_inicio: new Date().toISOString().slice(0, 10),
        fecha_fin: ''
      });
    }
    setIsEgresoFijoModalOpen(true);
  };

  const handleSaveEgresoFijo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!egresoFijoForm.razon.trim() || Number(egresoFijoForm.monto) <= 0) return;

    const progObj: any = { frecuencia: egresoFijoForm.frecuencia };
    if (egresoFijoForm.frecuencia === 'mensual') {
      progObj.dia_mes = Number(egresoFijoForm.dia_mes) || 1;
    } else if (egresoFijoForm.frecuencia === 'semanal') {
      progObj.dia_semana = egresoFijoForm.dia_semana;
    }

    const payload = {
      razon: egresoFijoForm.razon.trim(),
      descripcion: egresoFijoForm.descripcion || null,
      categoria_id: egresoFijoForm.categoria_id || null,
      monto: Number(egresoFijoForm.monto),
      programacion_pago: progObj,
      recordatorio_dias_antes: Number(egresoFijoForm.recordatorio_dias_antes) || 3,
      fecha_inicio: egresoFijoForm.fecha_inicio || null,
      fecha_fin: egresoFijoForm.fecha_fin || null,
      activo: 1
    };

    if (editingEgresoFijo) {
      await updateEgresoFijo(editingEgresoFijo.id, payload);
    } else {
      await createEgresoFijo(payload);
    }
    setIsEgresoFijoModalOpen(false);
  };

  // Modal Pagar Pago Programado
  const [isPagarModalOpen, setIsPagarModalOpen] = useState(false);
  const [selectedPagoForPay, setSelectedPagoForPay] = useState<PagoProgramado | null>(null);
  const [payMedioId, setPayMedioId] = useState('');
  const [payMontoReal, setPayMontoReal] = useState('');
  const [payNotas, setPayNotas] = useState('');

  const openPagarModal = (p: PagoProgramado) => {
    setSelectedPagoForPay(p);
    setPayMedioId(medios[0]?.id || '');
    setPayMontoReal(String(p.monto_esperado));
    setPayNotas('');
    setIsPagarModalOpen(true);
  };

  const handleExecutePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPagoForPay || !payMedioId || Number(payMontoReal) <= 0) return;

    await pagarPagoProgramado(selectedPagoForPay.id, {
      medio_id: payMedioId,
      monto_real: Number(payMontoReal),
      notas: payNotas || undefined
    });

    setIsPagarModalOpen(false);
  };

  // Modal Presupuesto
  const [isPresModalOpen, setIsPresModalOpen] = useState(false);
  const [editingPres, setEditingPres] = useState<Presupuesto | null>(null);
  const [presForm, setPresForm] = useState({
    nombre: '',
    categoria_id: '',
    monto_limite: '',
    periodo: 'mensual' as 'diario' | 'semanal' | 'mensual' | 'anual',
    fecha_inicio: new Date().toISOString().slice(0, 10),
    fecha_fin: ''
  });

  const openPresModal = (p?: Presupuesto) => {
    if (p) {
      setEditingPres(p);
      setPresForm({
        nombre: p.nombre,
        categoria_id: p.categoria_id || '',
        monto_limite: String(p.monto_limite),
        periodo: p.periodo,
        fecha_inicio: (p.fecha_inicio || '').slice(0, 10),
        fecha_fin: p.fecha_fin ? p.fecha_fin.slice(0, 10) : ''
      });
    } else {
      setEditingPres(null);
      setPresForm({
        nombre: '',
        categoria_id: categorias[0]?.id || '',
        monto_limite: '',
        periodo: 'mensual',
        fecha_inicio: new Date().toISOString().slice(0, 10),
        fecha_fin: ''
      });
    }
    setIsPresModalOpen(true);
  };

  const handleSavePresupuesto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!presForm.nombre.trim() || Number(presForm.monto_limite) <= 0) return;

    const payload = {
      nombre: presForm.nombre.trim(),
      categoria_id: presForm.categoria_id || null,
      monto_limite: Number(presForm.monto_limite),
      periodo: presForm.periodo,
      fecha_inicio: presForm.fecha_inicio,
      fecha_fin: presForm.fecha_fin || null,
      activo: 1
    };

    if (editingPres) {
      await updatePresupuesto(editingPres.id, payload);
    } else {
      await createPresupuesto(payload);
    }
    setIsPresModalOpen(false);
  };

  // Modal Categoría
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [catInput, setCatInput] = useState('');

  const handleSaveCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catInput.trim()) return;
    await createCategoriaFinanzas({ categoria: catInput.trim() });
    setCatInput('');
    setIsCatModalOpen(false);
  };

  return (
    <div className="finanzas-container">
      {/* ── HEADER ── */}
      <div className="finanzas-header">
        <div className="finanzas-header-title">
          <h1>
            <Wallet size={28} style={{ color: 'var(--accent-primary)' }} /> Control Financiero
          </h1>
          <p>Gestiona cuentas, ingresos, egresos, presupuestos y pagos programados</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-primary" onClick={() => openMovModal()}>
            <Plus size={18} /> Nuevo Movimiento
          </button>
        </div>
      </div>

      {/* ── TARJETAS DE RESUMEN ── */}
      <div className="finanzas-summary-grid">
        <div className="glass-card finanzas-summary-card">
          <span className="label">Saldo Total Disponible</span>
          <span className="amount" style={{ color: 'var(--accent-primary)' }}>
            S/ {saldoTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="glass-card finanzas-summary-card">
          <span className="label">Ingresos del Mes</span>
          <span className="amount" style={{ color: '#10b981' }}>
            +S/ {ingresosMes.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="glass-card finanzas-summary-card">
          <span className="label">Egresos del Mes</span>
          <span className="amount" style={{ color: '#ef4444' }}>
            -S/ {egresosMes.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="glass-card finanzas-summary-card">
          <span className="label">Balance Neto del Mes</span>
          <span className="amount" style={{ color: ingresosMes - egresosMes >= 0 ? '#10b981' : '#ef4444' }}>
            S/ {(ingresosMes - egresosMes).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="finanzas-tabs">
        <button
          className={`finanzas-tab-btn ${activeTab === 'movimientos' ? 'active' : ''}`}
          onClick={() => setActiveTab('movimientos')}
        >
          <DollarSign size={16} /> Movimientos ({movimientos.length})
        </button>
        <button
          className={`finanzas-tab-btn ${activeTab === 'medios' ? 'active' : ''}`}
          onClick={() => setActiveTab('medios')}
        >
          <CreditCard size={16} /> Cuentas & Medios ({medios.length})
        </button>
        <button
          className={`finanzas-tab-btn ${activeTab === 'egresos_fijos' ? 'active' : ''}`}
          onClick={() => setActiveTab('egresos_fijos')}
        >
          <Calendar size={16} /> Egresos Fijos & Pagos ({egresosFijos.length})
        </button>
        <button
          className={`finanzas-tab-btn ${activeTab === 'presupuestos' ? 'active' : ''}`}
          onClick={() => setActiveTab('presupuestos')}
        >
          <PieChart size={16} /> Presupuestos ({presupuestos.length})
        </button>
        <button
          className={`finanzas-tab-btn ${activeTab === 'categorias' ? 'active' : ''}`}
          onClick={() => setActiveTab('categorias')}
        >
          <Layers size={16} /> Categorías ({categorias.length})
        </button>
      </div>

      {/* ── TAB CONTENT: MOVIMIENTOS ── */}
      {activeTab === 'movimientos' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Barra de Filtros */}
          <div className="glass-card" style={{ padding: '14px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 200px' }}>
              <Search size={16} color="var(--text-muted)" />
              <input
                type="text"
                className="glass-input"
                style={{ width: '100%', padding: '6px 10px' }}
                placeholder="Buscar por descripción..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <select
                className="glass-select"
                style={{ padding: '6px 12px', fontSize: '13px' }}
                value={filterTipo}
                onChange={e => setFilterTipo(e.target.value)}
              >
                <option value="todos">Todos los Tipos</option>
                <option value="I">Solo Ingresos</option>
                <option value="E">Solo Egresos</option>
              </select>

              <select
                className="glass-select"
                style={{ padding: '6px 12px', fontSize: '13px' }}
                value={filterMedio}
                onChange={e => setFilterMedio(e.target.value)}
              >
                <option value="todos">Todos los Medios</option>
                {medios.map(m => (
                  <option key={m.id} value={m.id}>{m.medio}</option>
                ))}
              </select>

              <select
                className="glass-select"
                style={{ padding: '6px 12px', fontSize: '13px' }}
                value={filterCategoria}
                onChange={e => setFilterCategoria(e.target.value)}
              >
                <option value="todos">Todas las Categorías</option>
                {categorias.map(c => (
                  <option key={c.id} value={c.id}>{c.categoria}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Listado */}
          <div className="movimientos-table-container">
            {filteredMovimientos.length === 0 ? (
              <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No se encontraron movimientos registrados.
              </div>
            ) : (
              filteredMovimientos.map(m => {
                const medio = medios.find(med => med.id === m.medio_id);
                const cat = categorias.find(c => c.id === m.categoria_id);
                const isIngreso = m.tipo === 'I';

                return (
                  <div key={m.id} className="movimiento-item">
                    <div className="movimiento-left">
                      <div className={`movimiento-type-badge ${isIngreso ? 'ingreso' : 'egreso'}`}>
                        {isIngreso ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                            {m.descripcion || (isIngreso ? 'Ingreso' : 'Egreso')}
                          </span>
                          {cat && (
                            <span className="badge" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>
                              {cat.categoria}
                            </span>
                          )}
                          {medio && (
                            <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>
                              💳 {medio.medio}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {new Date(m.fecha_movimiento).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className={`movimiento-amount ${isIngreso ? 'ingreso' : 'egreso'}`}>
                        {isIngreso ? '+' : '-'}S/ {m.monto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn-icon" onClick={() => openMovModal(m)} title="Editar">
                          <Edit2 size={14} />
                        </button>
                        <button className="btn-icon danger" onClick={() => deleteMovimiento(m.id)} title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* ── TAB CONTENT: MEDIOS & CUENTAS ── */}
      {activeTab === 'medios' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--text-main)' }}>Cuentas y Billeteras</h2>
            <button className="btn-primary" onClick={() => openMedioModal()}>
              <Plus size={16} /> Nueva Cuenta
            </button>
          </div>

          <div className="medios-grid">
            {medios.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No tienes medios de pago registrados.</p>
            ) : (
              medios.map(m => (
                <div key={m.id} className="glass-card medio-card">
                  <div className="medio-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="medio-icon-wrapper">
                        {m.tipo_medio === 'efectivo' ? <Banknote size={20} /> : <CreditCard size={20} />}
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-main)' }}>{m.medio}</h3>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                          {m.banco ? `${m.banco} • ` : ''}{m.tipo_medio.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn-icon" onClick={() => openMedioModal(m)} title="Editar">
                        <Edit2 size={14} />
                      </button>
                      <button className="btn-icon danger" onClick={() => deleteMedio(m.id)} title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {m.numero_cuenta && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      N° {m.numero_cuenta}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto', paddingTop: '10px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Saldo Disponible</span>
                      <div className="medio-saldo">
                        S/ {(m.saldo_actual || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <button
                      className="btn-icon"
                      onClick={() => openSaldoModal(m)}
                      title="Ajustar saldo"
                      style={{ padding: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px' }}
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* ── TAB CONTENT: EGRESOS FIJOS & PAGOS PROGRAMADOS ── */}
      {activeTab === 'egresos_fijos' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Egresos Recurrentes */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--text-main)' }}>Egresos Fijos Recurrentes</h2>
              <button className="btn-primary" onClick={() => openEgresoFijoModal()}>
                <Plus size={16} /> Nuevo Egreso Fijo
              </button>
            </div>

            <div className="medios-grid">
              {egresosFijos.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No tienes egresos fijos programados.</p>
              ) : (
                egresosFijos.map(ef => {
                  const cat = categorias.find(c => c.id === ef.categoria_id);
                  let prog: any = {};
                  try {
                    prog = typeof ef.programacion_pago === 'string' ? JSON.parse(ef.programacion_pago) : ef.programacion_pago;
                  } catch {}

                  return (
                    <div key={ef.id} className="glass-card medio-card">
                      <div className="medio-card-header">
                        <div>
                          <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-main)' }}>{ef.razon}</h3>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {cat ? cat.categoria : 'Sin categoría'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn-icon" onClick={() => openEgresoFijoModal(ef)} title="Editar">
                            <Edit2 size={14} />
                          </button>
                          <button className="btn-icon danger" onClick={() => deleteEgresoFijo(ef.id)} title="Eliminar">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div>📅 Frecuencia: <strong style={{ color: 'var(--text-main)', textTransform: 'capitalize' }}>{prog.frecuencia || 'Mensual'}</strong></div>
                        {prog.dia_mes && <div>Día de pago: <strong>{prog.dia_mes} de cada mes</strong></div>}
                        <div>🔔 Recordatorio: <strong>{ef.recordatorio_dias_antes} días antes</strong></div>
                      </div>

                      <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Monto a Pagar</span>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444' }}>
                          S/ {ef.monto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Próximos Pagos Programados */}
          <div>
            <h2 style={{ fontSize: '18px', marginBottom: '14px', color: 'var(--text-main)' }}>Calendario de Pagos Programados</h2>
            <div className="movimientos-table-container">
              {pagosProgramados.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No hay pagos programados generados.</p>
              ) : (
                pagosProgramados.map(p => {
                  const ef = egresosFijos.find(e => e.id === p.egreso_fijo_id);
                  const isPagado = p.estado === 'pagado';

                  return (
                    <div key={p.id} className="movimiento-item" style={{ opacity: isPagado ? 0.7 : 1 }}>
                      <div className="movimiento-left">
                        <div className={`movimiento-type-badge ${isPagado ? 'ingreso' : 'egreso'}`}>
                          {isPagado ? <CheckCircle2 size={18} /> : <Calendar size={18} />}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                            {ef ? ef.razon : 'Pago Programado'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Fecha programada: <strong>{p.fecha_programada}</strong> • Estado: <span style={{ textTransform: 'capitalize', color: isPagado ? '#10b981' : '#f59e0b' }}>{p.estado}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: isPagado ? 'var(--text-muted)' : '#ef4444' }}>
                          S/ {p.monto_esperado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        {!isPagado ? (
                          <button
                            className="btn-primary"
                            style={{ padding: '6px 14px', fontSize: '13px' }}
                            onClick={() => openPagarModal(p)}
                          >
                            Pagar
                          </button>
                        ) : (
                          <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '4px 8px', borderRadius: '6px', fontSize: '12px' }}>
                            ✓ Pagado
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── TAB CONTENT: PRESUPUESTOS ── */}
      {activeTab === 'presupuestos' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--text-main)' }}>Presupuestos y Límites de Gasto</h2>
            <button className="btn-primary" onClick={() => openPresModal()}>
              <Plus size={16} /> Nuevo Presupuesto
            </button>
          </div>

          <div className="medios-grid">
            {presupuestos.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No tienes presupuestos configurados.</p>
            ) : (
              presupuestos.map(p => {
                const cat = categorias.find(c => c.id === p.categoria_id);
                // Calcular gastos en esta categoría para el periodo actual
                const gastado = movimientos
                  .filter(m => m.tipo === 'E' && m.categoria_id === p.categoria_id && (m.fecha_movimiento || '').startsWith(currentMonthStr))
                  .reduce((sum, m) => sum + m.monto, 0);

                const porcentaje = Math.min(Math.round((gastado / p.monto_limite) * 100), 100);
                let barColor = '#10b981';
                if (porcentaje > 90) barColor = '#ef4444';
                else if (porcentaje > 70) barColor = '#f59e0b';

                return (
                  <div key={p.id} className="glass-card medio-card">
                    <div className="medio-card-header">
                      <div>
                        <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-main)' }}>{p.nombre}</h3>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {cat ? cat.categoria : 'General'} • {p.periodo}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn-icon" onClick={() => openPresModal(p)} title="Editar">
                          <Edit2 size={14} />
                        </button>
                        <button className="btn-icon danger" onClick={() => deletePresupuesto(p.id)} title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Gastado: S/ {gastado.toFixed(2)}</span>
                        <span style={{ fontWeight: 600, color: barColor }}>{porcentaje}%</span>
                      </div>
                      <div className="presupuesto-progress-bar-bg">
                        <div
                          className="presupuesto-progress-bar-fill"
                          style={{ width: `${porcentaje}%`, background: barColor }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                        <span>Límite: S/ {p.monto_limite.toFixed(2)}</span>
                        <span>Restante: S/ {Math.max(p.monto_limite - gastado, 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* ── TAB CONTENT: CATEGORÍAS ── */}
      {activeTab === 'categorias' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--text-main)' }}>Categorías Financieras</h2>
            <button className="btn-primary" onClick={() => setIsCatModalOpen(true)}>
              <Plus size={16} /> Nueva Categoría
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {categorias.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No tienes categorías registradas.</p>
            ) : (
              categorias.map(c => (
                <div
                  key={c.id}
                  className="glass-card"
                  style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{c.categoria}</span>
                  <button
                    className="btn-icon danger"
                    style={{ padding: '4px' }}
                    onClick={() => deleteCategoriaFinanzas(c.id)}
                    title="Eliminar categoría"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* ── MODAL: MOVIMIENTO (CREAR/EDITAR) ── */}
      {isMovModalOpen && (
        <div className="modal-overlay" onClick={() => setIsMovModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingMov ? 'Editar Movimiento' : 'Nuevo Movimiento'}</h2>
              <button className="action-btn" onClick={() => setIsMovModalOpen(false)}><X size={22} /></button>
            </div>
            <form onSubmit={handleSaveMov} className="modal-body">
              {/* Selector Tipo */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '8px',
                    border: movForm.tipo === 'E' ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
                    background: movForm.tipo === 'E' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.03)',
                    color: movForm.tipo === 'E' ? '#ef4444' : 'var(--text-muted)',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                  onClick={() => setMovForm({ ...movForm, tipo: 'E' })}
                >
                  - Egreso (Gasto)
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '8px',
                    border: movForm.tipo === 'I' ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                    background: movForm.tipo === 'I' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.03)',
                    color: movForm.tipo === 'I' ? '#10b981' : 'var(--text-muted)',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                  onClick={() => setMovForm({ ...movForm, tipo: 'I' })}
                >
                  + Ingreso
                </button>
              </div>

              <div className="form-group">
                <label>Monto (S/) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-input"
                  required
                  placeholder="0.00"
                  value={movForm.monto}
                  onChange={e => setMovForm({ ...movForm, monto: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Cuenta / Medio de Pago *</label>
                <select
                  className="glass-select"
                  required
                  value={movForm.medio_id}
                  onChange={e => setMovForm({ ...movForm, medio_id: e.target.value })}
                >
                  <option value="" disabled>Selecciona una cuenta...</option>
                  {medios.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.medio} (S/ {(m.saldo_actual || 0).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Categoría</label>
                <select
                  className="glass-select"
                  value={movForm.categoria_id}
                  onChange={e => setMovForm({ ...movForm, categoria_id: e.target.value })}
                >
                  <option value="">(Sin categoría)</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.categoria}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Fecha</label>
                <input
                  type="date"
                  className="form-input"
                  value={movForm.fecha_movimiento}
                  onChange={e => setMovForm({ ...movForm, fecha_movimiento: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Descripción / Detalle</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej. Almuerzo menú, Taxi, etc."
                  value={movForm.descripcion}
                  onChange={e => setMovForm({ ...movForm, descripcion: e.target.value })}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="action-btn" onClick={() => setIsMovModalOpen(false)} disabled={isSavingMov}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={isSavingMov} style={{ opacity: isSavingMov ? 0.75 : 1 }}>
                  {isSavingMov ? (
                    <>
                      <Loader2 size={16} className="animate-spin" style={{ marginRight: '6px' }} />
                      Guardando...
                    </>
                  ) : (
                    editingMov ? 'Actualizar Movimiento' : 'Guardar Movimiento'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: MEDIO (CREAR/EDITAR) ── */}
      {isMedioModalOpen && (
        <div className="modal-overlay" onClick={() => setIsMedioModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingMedio ? 'Editar Cuenta' : 'Nueva Cuenta / Medio'}</h2>
              <button className="action-btn" onClick={() => setIsMedioModalOpen(false)}><X size={22} /></button>
            </div>
            <form onSubmit={handleSaveMedio} className="modal-body">
              <div className="form-group">
                <label>Nombre de la Cuenta *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="Ej. BCP Principal, Yape, Billetera Efectivo"
                  value={medioForm.medio}
                  onChange={e => setMedioForm({ ...medioForm, medio: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Tipo de Medio *</label>
                <select
                  className="glass-select"
                  value={medioForm.tipo_medio}
                  onChange={e => setMedioForm({ ...medioForm, tipo_medio: e.target.value })}
                >
                  <option value="cuenta_bancaria">Cuenta Bancaria</option>
                  <option value="yape">Billetera Digital (Yape / Plin)</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta_credito">Tarjeta de Crédito</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              <div className="form-group">
                <label>Banco (opcional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej. BCP, BBVA, Interbank"
                  value={medioForm.banco}
                  onChange={e => setMedioForm({ ...medioForm, banco: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Número de Cuenta o Teléfono (opcional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej. 193-12345678-0-12"
                  value={medioForm.numero_cuenta}
                  onChange={e => setMedioForm({ ...medioForm, numero_cuenta: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>{editingMedio ? 'Saldo Actual / Ajustar Saldo (S/) *' : 'Saldo Inicial (S/) *'}</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  required
                  value={medioForm.saldo_inicial}
                  onChange={e => setMedioForm({ ...medioForm, saldo_inicial: e.target.value })}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {editingMedio ? 'Si cambias el saldo, se registrará un movimiento de ajuste contable automático.' : 'Se guardará como saldo disponible y movimiento de ingreso inicial.'}
                </span>
              </div>

              <div className="modal-footer">
                <button type="button" className="action-btn" onClick={() => setIsMedioModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar Cuenta</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: AJUSTE RÁPIDO DE SALDO ── */}
      {isSaldoModalOpen && selectedMedioForSaldo && (
        <div className="modal-overlay" onClick={() => setIsSaldoModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Ajustar Saldo: {selectedMedioForSaldo.medio}</h2>
              <button className="action-btn" onClick={() => setIsSaldoModalOpen(false)}><X size={22} /></button>
            </div>
            <form onSubmit={handleSaveSaldo} className="modal-body">
              <div className="form-group">
                <label>Nuevo Saldo Disponible (S/) *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  required
                  value={nuevoSaldoInput}
                  onChange={e => setNuevoSaldoInput(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="action-btn" onClick={() => setIsSaldoModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Actualizar Saldo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: EGRESO FIJO ── */}
      {isEgresoFijoModalOpen && (
        <div className="modal-overlay" onClick={() => setIsEgresoFijoModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingEgresoFijo ? 'Editar Egreso Fijo' : 'Nuevo Egreso Fijo Programado'}</h2>
              <button className="action-btn" onClick={() => setIsEgresoFijoModalOpen(false)}><X size={22} /></button>
            </div>
            <form onSubmit={handleSaveEgresoFijo} className="modal-body">
              <div className="form-group">
                <label>Concepto / Razón *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="Ej. Alquiler de Departamento, Internet Fibra, Spotify"
                  value={egresoFijoForm.razon}
                  onChange={e => setEgresoFijoForm({ ...egresoFijoForm, razon: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Monto a Pagar (S/) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-input"
                  required
                  value={egresoFijoForm.monto}
                  onChange={e => setEgresoFijoForm({ ...egresoFijoForm, monto: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Categoría</label>
                <select
                  className="glass-select"
                  value={egresoFijoForm.categoria_id}
                  onChange={e => setEgresoFijoForm({ ...egresoFijoForm, categoria_id: e.target.value })}
                >
                  <option value="">(Sin categoría)</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.categoria}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Frecuencia de Pago *</label>
                <select
                  className="glass-select"
                  value={egresoFijoForm.frecuencia}
                  onChange={e => setEgresoFijoForm({ ...egresoFijoForm, frecuencia: e.target.value })}
                >
                  <option value="mensual">Mensual</option>
                  <option value="semanal">Semanal</option>
                  <option value="diario">Diario</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="anual">Anual</option>
                </select>
              </div>

              {egresoFijoForm.frecuencia === 'mensual' && (
                <div className="form-group">
                  <label>Día del Mes a Pagar (1-31) *</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    className="form-input"
                    value={egresoFijoForm.dia_mes}
                    onChange={e => setEgresoFijoForm({ ...egresoFijoForm, dia_mes: e.target.value })}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Días antes para recordatorio de alerta (0 = mismo día)</label>
                <input
                  type="number"
                  min="0"
                  className="form-input"
                  value={egresoFijoForm.recordatorio_dias_antes}
                  onChange={e => setEgresoFijoForm({ ...egresoFijoForm, recordatorio_dias_antes: e.target.value })}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="action-btn" onClick={() => setIsEgresoFijoModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar Egreso Fijo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: PAGAR CUOTA ── */}
      {isPagarModalOpen && selectedPagoForPay && (
        <div className="modal-overlay" onClick={() => setIsPagarModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Registrar Pago de Cuota</h2>
              <button className="action-btn" onClick={() => setIsPagarModalOpen(false)}><X size={22} /></button>
            </div>
            <form onSubmit={handleExecutePayment} className="modal-body">
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                Fecha programada: <strong>{selectedPagoForPay.fecha_programada}</strong>
              </p>

              <div className="form-group">
                <label>Monto Real Pagado (S/) *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  required
                  value={payMontoReal}
                  onChange={e => setPayMontoReal(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Cuenta / Medio con que pagaste *</label>
                <select
                  className="glass-select"
                  required
                  value={payMedioId}
                  onChange={e => setPayMedioId(e.target.value)}
                >
                  {medios.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.medio} (Saldo: S/ {(m.saldo_actual || 0).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Notas adicionales</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej. Pagado por transferencia con Nro de operación"
                  value={payNotas}
                  onChange={e => setPayNotas(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="action-btn" onClick={() => setIsPagarModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Confirmar Pago</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: PRESUPUESTO ── */}
      {isPresModalOpen && (
        <div className="modal-overlay" onClick={() => setIsPresModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPres ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}</h2>
              <button className="action-btn" onClick={() => setIsPresModalOpen(false)}><X size={22} /></button>
            </div>
            <form onSubmit={handleSavePresupuesto} className="modal-body">
              <div className="form-group">
                <label>Nombre del Presupuesto *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="Ej. Presupuesto Comida Mensual"
                  value={presForm.nombre}
                  onChange={e => setPresForm({ ...presForm, nombre: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Categoría a Controlar *</label>
                <select
                  className="glass-select"
                  required
                  value={presForm.categoria_id}
                  onChange={e => setPresForm({ ...presForm, categoria_id: e.target.value })}
                >
                  <option value="" disabled>Selecciona una categoría...</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.categoria}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Monto Límite (S/) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-input"
                  required
                  placeholder="0.00"
                  value={presForm.monto_limite}
                  onChange={e => setPresForm({ ...presForm, monto_limite: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Periodo *</label>
                <select
                  className="glass-select"
                  value={presForm.periodo}
                  onChange={e => setPresForm({ ...presForm, periodo: e.target.value as any })}
                >
                  <option value="mensual">Mensual</option>
                  <option value="semanal">Semanal</option>
                  <option value="anual">Anual</option>
                </select>
              </div>

              <div className="modal-footer">
                <button type="button" className="action-btn" onClick={() => setIsPresModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar Presupuesto</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CATEGORÍA ── */}
      {isCatModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCatModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Nueva Categoría Financiera</h2>
              <button className="action-btn" onClick={() => setIsCatModalOpen(false)}><X size={22} /></button>
            </div>
            <form onSubmit={handleSaveCategoria} className="modal-body">
              <div className="form-group">
                <label>Nombre de la Categoría *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="Ej. Comida, Transporte, Servicios, Sueldo"
                  value={catInput}
                  onChange={e => setCatInput(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="action-btn" onClick={() => setIsCatModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar Categoría</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
