import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './app/AppContext';
import { App } from './app/App';
import { ParentalProvider } from './app/ParentalContext';
import { registerServiceWorker } from './app/pwa';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <ParentalProvider>
        <App />
      </ParentalProvider>
    </AppProvider>
  </StrictMode>,
);

document.documentElement.dataset.appVersion = __APP_VERSION__;
registerServiceWorker();
