import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToolsAuthGate } from './ToolsAuthGate';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToolsAuthGate />
  </StrictMode>
);
