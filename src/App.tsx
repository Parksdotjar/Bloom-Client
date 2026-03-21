import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HOST_SERVERS_UNLOCK_EVENT, HOST_SERVERS_UNLOCK_KEY, readHostServersUnlocked } from './constants/hostServerAccess';
import './App.css';

const Home = lazy(() => import('./pages/Home').then((module) => ({ default: module.Home })));
const Instances = lazy(() => import('./pages/Instances').then((module) => ({ default: module.Instances })));
const Downloads = lazy(() => import('./pages/Downloads').then((module) => ({ default: module.Downloads })));
const Settings = lazy(() => import('./pages/Settings').then((module) => ({ default: module.Settings })));
const Widgets = lazy(() => import('./pages/Widgets').then((module) => ({ default: module.Widgets })));
const Games = lazy(() => import('./pages/Games').then((module) => ({ default: module.Games })));
const InstanceEditor = lazy(() => import('./pages/InstanceEditor').then((module) => ({ default: module.InstanceEditor })));
const Marketplace = lazy(() => import('./pages/Marketplace').then((module) => ({ default: module.Marketplace })));
const Help = lazy(() => import('./pages/Help').then((module) => ({ default: module.Help })));
const ScriptStudio = lazy(() => import('./pages/ScriptStudio').then((module) => ({ default: module.ScriptStudio })));
const HostServer = lazy(() => import('./pages/HostServer').then((module) => ({ default: module.HostServer })));

function App() {
  const [hostServersUnlocked, setHostServersUnlocked] = useState<boolean>(() => readHostServersUnlocked());

  useEffect(() => {
    const syncHostServersUnlocked = () => {
      setHostServersUnlocked(readHostServersUnlocked());
    };
    const onUnlockChange = (event: Event) => {
      const custom = event as CustomEvent<{ unlocked?: boolean }>;
      if (typeof custom.detail?.unlocked === 'boolean') {
        setHostServersUnlocked(custom.detail.unlocked);
        return;
      }
      syncHostServersUnlocked();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === HOST_SERVERS_UNLOCK_KEY) {
        syncHostServersUnlocked();
      }
    };
    window.addEventListener(HOST_SERVERS_UNLOCK_EVENT, onUnlockChange as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(HOST_SERVERS_UNLOCK_EVENT, onUnlockChange as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

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
            <Route path="/games" element={<Games />} />
            <Route path="/help" element={<Help />} />
            <Route path="/script-studio" element={<ScriptStudio />} />
            <Route path="/host-server" element={hostServersUnlocked ? <HostServer /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </Router>
  );
}

export default App;
