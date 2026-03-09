import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import './App.css';

const Home = lazy(() => import('./pages/Home').then((module) => ({ default: module.Home })));
const Instances = lazy(() => import('./pages/Instances').then((module) => ({ default: module.Instances })));
const Downloads = lazy(() => import('./pages/Downloads').then((module) => ({ default: module.Downloads })));
const Settings = lazy(() => import('./pages/Settings').then((module) => ({ default: module.Settings })));
const Widgets = lazy(() => import('./pages/Widgets').then((module) => ({ default: module.Widgets })));
const InstanceEditor = lazy(() => import('./pages/InstanceEditor').then((module) => ({ default: module.InstanceEditor })));
const Marketplace = lazy(() => import('./pages/Marketplace').then((module) => ({ default: module.Marketplace })));
const Help = lazy(() => import('./pages/Help').then((module) => ({ default: module.Help })));

function App() {
  return (
    <Router>
      <Layout>
        <Suspense fallback={<div className="mx-auto max-w-[1360px] px-4 py-6 text-sm font-extrabold uppercase tracking-[0.16em] text-white/45">Loading page...</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/instances" element={<Instances />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/mods" element={<Navigate to="/marketplace?tab=mods" replace />} />
            <Route path="/modpacks" element={<Navigate to="/marketplace?tab=modpacks" replace />} />
            <Route path="/resourcepacks" element={<Navigate to="/marketplace?tab=resourcepacks" replace />} />
            <Route path="/instance-editor" element={<InstanceEditor />} />
            <Route path="/importer" element={<Downloads />} />
            <Route path="/downloads" element={<Navigate to="/importer" replace />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/widgets" element={<Widgets />} />
            <Route path="/help" element={<Help />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </Router>
  );
}

export default App;
