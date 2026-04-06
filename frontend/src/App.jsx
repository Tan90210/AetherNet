import { Routes, Route } from 'react-router-dom';
import Navbar from './components/common/Navbar.jsx';
import Footer from './components/common/Footer.jsx';
import Home from './pages/Home.jsx';
import Marketplace from './pages/Marketplace.jsx';
import ModelDetail from './pages/ModelDetail.jsx';
import Dashboard from './pages/Dashboard.jsx';

export default function App() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <Navbar />
            <main style={{ flex: 1 }}>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/marketplace" element={<Marketplace />} />
                    <Route path="/models/:id" element={<ModelDetail />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                </Routes>
            </main>
            <Footer />
        </div>
    );
}
