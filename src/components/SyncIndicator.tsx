import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB } from '../db/localDb';
import { synchronizeData } from '../services/sync';

export function SyncIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. Magia reactiva: Se actualiza solito cuando la tabla cambia, sin setInterval
  const pendingCount = useLiveQuery(() => localDB.pendingSync.count(), []) ?? 0;

  // 2. Escuchar la conexión a internet
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      if (pendingCount > 0) {
        setIsSyncing(true);
        await synchronizeData(); // Dispara la sincronización automáticamente
        setIsSyncing(false);
      }
    };
    
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Intentar sincronizar al montar el componente si hay internet y pendientes
    if (navigator.onLine && pendingCount > 0) {
      handleOnline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [pendingCount]); // Depende de pendingCount para saber si debe sincronizar

  // 3. Renderizado condicional para dar mejor feedback
  if (!isOnline) {
    return <div>🔴 Sin conexión ({pendingCount} por subir)</div>;
  }

  if (isSyncing) {
    return <div>🔄 Sincronizando...</div>;
  }

  return (
    <div>
      {pendingCount > 0 
        ? `⏳ ${pendingCount} pendientes` 
        : '✅ Todo sincronizado'}
    </div>
  );
}