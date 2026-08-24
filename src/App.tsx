import { useEffect } from 'react';
import './App.css';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { synchronizeData, downloadAllData } from './services/sync';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DashboardView } from './views/DashboardView';
import { TareasView } from './views/TareasView';
import { AppLayout } from './components/AppLayout';
import { GestionAreasView } from './views/GestionAreasView';
import { DetalleAreaView } from './views/DetalleAreaView';
import { EvaluacionView } from './views/EvaluacionView';

import { PremiosView } from './views/PremiosView';
import { FoodTrackerView } from './views/FoodTrackerView';
import { FinanzasView } from './views/FinanzasView';
import BookOpen from './views/BookOpen';
import { SyncAdminView } from './views/SyncAdminView';

function App() {
  const isOnline = useOnlineStatus();

  // Escucha de sincronización global
  useEffect(() => {
    if (isOnline) {
      // 1. Subimos cambios locales pendientes a la nube
      synchronizeData()
        .then(() => {
          // 2. Descargamos todo lo de la nube a local de forma segura
          return downloadAllData();
        })
        .catch(console.error);
    }
  }, [isOnline]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardView />} />
          <Route path="/finanzas" element={<FinanzasView />} />
          <Route path="/proyectos" element={<GestionAreasView />} />
          <Route path="/proyectos/:areaId" element={<DetalleAreaView />} />
          <Route path="/tareas" element={<TareasView />} />
          <Route path="/evaluacion" element={<EvaluacionView />} />
          <Route path="/premios" element={<PremiosView />} />
          <Route path="/food-tracker" element={<FoodTrackerView />} />
          <Route path="/learning" element={<BookOpen />} />
          <Route path="/sync-admin" element={<SyncAdminView />} />
        </Route>
        
      </Routes>
    </BrowserRouter>
  );
}

export default App;