import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Textes du PID : Atkinson Hyperlegible Mono (OFL), dessinée pour la lisibilité à distance (0/O, 1/l/I
// bien distincts), en demi-gras plutôt qu'en gras (le gras referme les lettres de loin).
import '@fontsource/atkinson-hyperlegible-mono/latin-400.css';
import '@fontsource/atkinson-hyperlegible-mono/latin-500.css';
import '@fontsource/atkinson-hyperlegible-mono/latin-600.css';
import './theme/fonts.css';
import './theme/tokens.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
