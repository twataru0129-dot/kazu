import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './app/AppContext';
import { App } from './app/App';
import { registerServiceWorker } from './app/pwa';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);

document.documentElement.dataset.appVersion = __APP_VERSION__;
registerServiceWorker();
