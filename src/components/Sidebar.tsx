import { useState } from 'react';
import { Home, Folder, BarChart2, CheckSquare, Calendar, Gift, Apple, Sun, Moon, Menu, Database, X, BookOpen } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import './Sidebar.css';

export function Sidebar() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false); // Estado para controlar el menú en móvil

  const menuItems = [
    { icon: Home, path: '/', label: 'Inicio', tooltip: 'Dashboard' },
    { icon: Folder, path: '/proyectos', label: 'Proyectos', tooltip: 'Áreas y Proyectos' },
    { icon: CheckSquare, path: '/tareas', label: 'Tareas', tooltip: 'Tareas' },
    { icon: Calendar, path: '/evaluacion', label: 'Evaluación', tooltip: 'Evaluaciones' },
    { icon: Gift, path: '/premios', label: 'Premios', tooltip: 'Gestión de Premios' },
    { icon: Apple, path: '/food-tracker', label: 'Food Tracker', tooltip: 'Dieta y Macros' },
    { icon: BookOpen, path: '/learning', label: 'Learning', tooltip: 'Aprendizaje' },
    { icon: Database, path: '/sync-admin', label: 'Sincronización', tooltip: 'Estado de Datos' },
  ];

  return (
    <>
      {/* Botón flotante para abrir el menú en móviles (FAB) */}
      <button className="mobile-menu-toggle glass-card" onClick={() => setIsOpen(true)}>
        <Menu size={24} color="var(--text-main)" />
      </button>

      {/* Overlay oscuro para cerrar el menú al hacer clic afuera */}
      {isOpen && <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />}

      <aside className={`glass-card sidebar-container ${isOpen ? 'open' : ''}`}>
        
        <div className="sidebar-nav">
          <div className="sidebar-logo">
            <div className="logo-icon">
              <BarChart2 size={24} />
            </div>
            <span className="sidebar-title-mobile">TrackerApp</span>
          </div>

          {/* Menú principal */}
          {menuItems.map((item, idx) => (
            <div key={idx} className="tooltip-container">
              <Link 
                to={item.path} 
                className={`sidebar-link ${location.pathname === item.path ? 'active' : ''}`}
                onClick={() => setIsOpen(false)} // Se cierra automáticamente al navegar
              >
                <item.icon size={22} className="sidebar-icon" />
                <span className="sidebar-label">{item.label}</span>
              </Link>
              <span className="tooltip-text">{item.tooltip}</span>
            </div>
          ))}
        </div>

        {/* Botón de Tema */}
        <div className="tooltip-container" style={{ marginTop: 'auto', paddingTop: '20px' }}>
          <button onClick={toggleTheme} className="sidebar-btn">
            {theme === 'light' ? <Moon size={22} className="sidebar-icon" /> : <Sun size={22} className="sidebar-icon" />}
            <span className="sidebar-label">Tema ({theme})</span>
          </button>
          <span className="tooltip-text">Modo {theme === 'light' ? 'Oscuro' : 'Claro'}</span>
        </div>

        {/* Botón de cerrar cruz (solo móvil) */}
        <button className="mobile-close-btn" onClick={() => setIsOpen(false)}>
          <X size={24} color="var(--text-muted)" />
        </button>

      </aside>
    </>
  );
}