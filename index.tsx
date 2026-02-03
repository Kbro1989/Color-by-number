import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { db } from './src/services/instantDb';
import './src/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Defensive check for InstantDB Provider
const isProviderValid = !!(db && db.Provider);
console.log(`[InstantDB] Provider status: ${isProviderValid ? 'VALID' : 'MISSING'}`);

root.render(
  <React.StrictMode>
    {isProviderValid ? (
      <db.Provider>
        <App />
      </db.Provider>
    ) : (
      <>
        <App />
        {/* Transparent alert for debug in production if needed */}
        {window.location.hostname === 'localhost' && !isProviderValid && (
          <div style={{ position: 'fixed', bottom: 0, background: 'red', color: 'white', zIndex: 9999 }}>Provider Missing!</div>
        )}
      </>
    )}
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}