import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { useAppStore } from './store/appStore';
import { ToastContainer } from './components/Toast';
import DebugBadge from './components/DebugBadge';
import { DEV_TOOLS_ENABLED } from './lib/devTools';
import AdminEditBar from './components/admin-edit/AdminEditBar';
import { AdminEditModeProvider } from './components/admin-edit/AdminEditModeContext';

const App: React.FC = () => {
  const { currentUser, logout, setDebugInfo } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setDebugInfo({ label: location.pathname });
  }, [location.pathname, setDebugInfo]);

  const handleLogout = () => {
    logout();
    navigate('/');
  }

  const isGlobeExperienceRoute = ['/explore', '/map', '/globe', '/dev/globe', '/dev/hybrid-globe', '/dev/language-explorer-globe', '/dev/hero-camera'].includes(location.pathname);
  const explorerSurface = location.pathname === '/map'
    ? 'map' as const
    : location.pathname === '/globe' || location.pathname === '/dev/globe' || location.pathname === '/dev/hybrid-globe' || location.pathname === '/dev/language-explorer-globe'
      ? 'globe' as const
      : null;
  const isScrollablePage = !isGlobeExperienceRoute;
  const showDebugBadge = DEV_TOOLS_ENABLED && location.pathname.startsWith('/dev/');

  return (
    <AdminEditModeProvider>
    <div className="ss-bg-base relative min-h-screen font-sans text-gray-100 flex flex-col">
       {showDebugBadge ? <DebugBadge /> : null}
       <ToastContainer />
       <AdminEditBar />
      <div className="ss-bg-geometric pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
      
      <div className={`relative z-10 flex flex-col flex-grow min-h-0 ${!isScrollablePage ? 'h-screen' : ''}`}>
        <Header 
          variant={location.pathname === '/' || explorerSurface ? 'landing' : 'default'}
          onAddListing={() => navigate('/submission')} 
          onHomeClick={() => navigate('/')}
          onLoginClick={() => navigate('/login')}
          onSignUpClick={() => navigate('/signup')}
          onAdminClick={() => navigate('/admin')}
          onHostDashboardClick={() => navigate('/host-dashboard')}
          onAccountClick={() => navigate('/account')}
          onMapClick={() => navigate('/map')}
          onGlobeClick={() => navigate('/globe')}
          explorerSurface={explorerSurface}
        />
        <main className={isScrollablePage ? 'flex-1 min-h-0' : 'flex-1 min-h-0 overflow-hidden'}>
          <Outlet />
        </main>
      </div>
    </div>
    </AdminEditModeProvider>
  );
};

export default App;
