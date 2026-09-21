import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { createSupabaseSessionGateway } from './auth/supabase-session-gateway.js';
import { readWebConfig } from './config.js';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Portfolio web root element is missing.');

const root = createRoot(rootElement);

try {
  const config = readWebConfig();
  const sessionGateway = createSupabaseSessionGateway(
    config.supabaseUrl,
    config.supabaseAnonKey,
  );
  root.render(
    <StrictMode>
      <App sessionGateway={sessionGateway} />
    </StrictMode>,
  );
} catch (cause) {
  const message =
    cause instanceof Error ? cause.message : 'Portfolio web bootstrap failed.';
  root.render(
    <main className="status-page" role="alert">
      <strong>Portfolio configuration error.</strong>
      <span>{message}</span>
    </main>,
  );
}
