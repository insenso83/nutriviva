const originalFetch = window.fetch;
window.fetch = async function (resource, init) {
  let url = typeof resource === 'string' ? resource : resource instanceof Request ? resource.url : '';
  
  if (url.includes('/api/auth/') || url.includes('/api/me')) {
    return new Response(JSON.stringify({ id: "mock-id-123", email: "frank.insenso@gmail.com", status: "success" }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (url.includes('bwsvyufsjfojbyqivami.supabase.co')) {
    try {
      const method = (init && init.method) || (resource instanceof Request ? resource.method : 'GET');
      
      let bodyData = {};
      if (init && init.body) {
        try {
          bodyData = typeof init.body === 'string' ? JSON.parse(init.body) : {};
        } catch (e) {}
      }

      if (url.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({
          id: "mock-id-123",
          email: "frank.insenso@gmail.com",
          aud: "authenticated",
          role: "authenticated"
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.includes('/auth/v1/')) {
        return new Response(JSON.stringify({
          access_token: "mock-jwt-token-xyz",
          token_type: "bearer",
          user: { id: "mock-id-123", email: "frank.insenso@gmail.com" }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      
      // Dati strutturati per il piano e i profili
      const mockItem = {
        id: "mock-id-123",
        user_id: "mock-id-123",
        status: "success",
        days: [
          { day: "Lunedì", meals: [{ name: "Colazione", description: "Uova e avena" }] },
          { day: "Martedì", meals: [{ name: "Colazione", description: "Yogurt e frutta" }] }
        ],
        items: [],
        data: [],
        title: "Piano Personalizzato",
        calories: 2500,
        ...bodyData,
        created_at: new Date().toISOString()
      };

      // PERFETTO: POST/PATCH restituiscono l'oggetto inserito, GET restituisce l'array
      const responseData = (method.toUpperCase() === 'GET') ? [mockItem] : mockItem;

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Preference-Applied': 'return=representation',
          'Content-Range': '0-0/1'
        }
      });

    } catch (e) {
      console.error("Errore intercettazione fetch:", e);
    }
  }
  
  return originalFetch.call(this, resource, init);
};

import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App';
import { queryClient } from './lib/queryClient';

function getElementIdSafe(id) {
  return document.getElementById(id);
}

const root = ReactDOM.createRoot(getElementIdSafe('root') || document.getElementById('root'));

root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);