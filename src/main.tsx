import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/shared/ErrorBoundary.tsx';
import { PWALifecycle } from './pwa/PWALifecycle';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <PWALifecycle />
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
