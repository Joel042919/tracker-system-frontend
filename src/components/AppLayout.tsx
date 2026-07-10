import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import './AppLayout.css';

export function AppLayout() {
  return (
    <div className="app-layout">
      {/* El Sidebar ahora vivirá aquí una sola vez */}
      <Sidebar />
      
      {/* <Outlet /> es donde React Router inyectará Dashboard, Tareas, etc. */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}