import React from 'react';
import ReactDOM from 'react-dom/client';
import ComingSoonPage from './components/ComingSoonPage';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ComingSoonPage />
  </React.StrictMode>,
);
