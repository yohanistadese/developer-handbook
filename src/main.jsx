import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router';
import DocPage from './DocPage';
import './docs.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <header className="site-header">
        <Link to="/">Developer Handbook</Link>
      </header>
      <Routes>
        <Route path="*" element={<DocPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
