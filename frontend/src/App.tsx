import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Navigation from './components/Navigation';
import SchedulePage from './pages/SchedulePage';
import InventoryPage from './pages/InventoryPage';
import DetailPage from './pages/DetailPage';
import './App.css';
import './cjpb.css';

function App() {
  return (
    <Router>
      <Navigation />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<SchedulePage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/detail/:code" element={<DetailPage />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;
