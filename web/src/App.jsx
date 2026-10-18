import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { NotificationProvider } from './context/NotificationContext.jsx';
import ToastContainer from './components/ToastContainer.jsx';
import NotificationDrawer from './components/NotificationDrawer.jsx';
import Home from './pages/Home.jsx';

export default function App() {
  return (
    <NotificationProvider>
      <BrowserRouter>
        <ToastContainer />
        <NotificationDrawer />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </NotificationProvider>
  );
}
