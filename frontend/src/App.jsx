import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store';
import Home      from './pages/Home';
import Dashboard from './pages/Dashboard';
import Compare   from './pages/Compare';
import Fleet     from './pages/Fleet';
import Tokens    from './pages/Tokens';
import ReleaseNotes from './pages/ReleaseNotes';

export default function App() {
  const darkMode = useStore(s => s.darkMode);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                         element={<Home />} />
        <Route path="/:target/:version/:build" element={<Dashboard />} />
        <Route path="/:target/:version"         element={<Dashboard />} />
        <Route path="/:target"                  element={<Dashboard />} />
        <Route path="/compare"                  element={<Compare />} />
        <Route path="/fleet"                    element={<Fleet />} />
        <Route path="/tokens"                   element={<Tokens />} />
        <Route path="/release-notes"            element={<ReleaseNotes />} />
        <Route path="*"                         element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
