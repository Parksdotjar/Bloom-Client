import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Instances } from './pages/Instances';
import { Downloads } from './pages/Downloads';
import { Settings } from './pages/Settings';
import { Widgets } from './pages/Widgets';
import { InstanceEditor } from './pages/InstanceEditor';
import { SkinStudio } from './pages/SkinStudio';
import { ModsMarket } from './pages/ModsMarket';
import { ModpacksMarket } from './pages/ModpacksMarket';
import { ResourcePacksMarket } from './pages/ResourcePacksMarket';
import './App.css';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/instances" element={<Instances />} />
          <Route path="/mods" element={<ModsMarket />} />
          <Route path="/modpacks" element={<ModpacksMarket />} />
          <Route path="/resourcepacks" element={<ResourcePacksMarket />} />
          <Route path="/instance-editor" element={<InstanceEditor />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/skins" element={<SkinStudio />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/widgets" element={<Widgets />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
