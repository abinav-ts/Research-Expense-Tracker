import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './brand/theme.css';
import { App } from './app/App.tsx';
import { finishLoading } from './app/boot.ts';
import { startInstallWatch } from './app/install.ts';
import { startPwa } from './app/pwa.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
startPwa();
startInstallWatch();
finishLoading();
