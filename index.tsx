import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { db } from './src/services/instantDb';
import './src/index.css';

console.log("Index.tsx: Starting execution");
console.log("Index.tsx: App component is", typeof App === 'undefined' ? 'UNDEFINED' : 'defined');
console.log("Index.tsx: DB Provider is", typeof db?.Provider === 'undefined' ? 'UNDEFINED' : 'defined');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
console.log("Index.tsx: Rendering App with Provider...");
root.render(
  <React.StrictMode>
    {db?.Provider ? (
      <db.Provider>
        <App />
      </db.Provider>
    ) : (
      <App />
    )}
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}