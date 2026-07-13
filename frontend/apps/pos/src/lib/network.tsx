import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Network } from '@capacitor/network';
import type { PluginListenerHandle } from '@capacitor/core';

const NetworkContext = createContext<boolean>(true);

// Expone si hay conexión. En el dispositivo usa el estado real de la red; en
// el navegador, navigator.onLine. Es la base del comportamiento offline.
export function NetworkProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let handle: PluginListenerHandle | undefined;
    void Network.getStatus().then((s) => setOnline(s.connected));
    void Network.addListener('networkStatusChange', (s) => setOnline(s.connected)).then((h) => {
      handle = h;
    });
    return () => {
      void handle?.remove();
    };
  }, []);

  return <NetworkContext.Provider value={online}>{children}</NetworkContext.Provider>;
}

export function useOnline(): boolean {
  return useContext(NetworkContext);
}
