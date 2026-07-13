import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NetworkProvider } from '@/lib/network';
import { AuthProvider } from '@/lib/auth';
import { SyncProvider } from '@/offline/sync';
import { App } from '@/app/App';
import './styles.css';

const queryClient = new QueryClient();

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró #root');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NetworkProvider>
        <AuthProvider>
          <SyncProvider>
            <App />
          </SyncProvider>
        </AuthProvider>
      </NetworkProvider>
    </QueryClientProvider>
  </StrictMode>,
);
