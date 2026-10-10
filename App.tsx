import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { useAppStore } from './store/appStore';
import { ToastContainer } from './components/Toast';
import DebugBadge from './components/DebugBadge';
import { DEV_TOOLS_ENABLED } from './lib/devTools';
import { AdminEditModeProvider } from './components/admin-edit/AdminEditModeContext';
import Seo from './components/Seo';
import { resolvePageSeo } from './lib/staticSeo';

const AdminEditBar = React.lazy(() => import('./components/admin-edit/AdminEditBar'));

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

  const isGlobeExperienceRoute = ['/explore', '/map', '/globe', '/dev/globe', '/dev/hybrid-globe', '/dev/usa-pin-lab', '/dev/language-explorer-globe', '/dev/hero-camera', '/dev/lighting-audit', '/dev/street-view'].includes(location.pathname);
  const explorerSurface =
    location.pathname === '/map'
      ? ('map' as const)
      : location.pathname === '/discover'
        ? ('directory' as const)
        : location.pathname === '/globe' || location.pathname === '/dev/globe' || location.pathname === '/dev/hybrid-globe' || location.pathname === '/dev/usa-pin-lab' || location.pathname === '/dev/language-explorer-globe'
          ? ('globe' as const)
          : null;
  const isScrollablePage = !isGlobeExperienceRoute;
  const explorerScopeSearch = new URLSearchParams(location.search).has('activityRegion') ? location.search : '';
  const showDebugBadge = DEV_TOOLS_ENABLED && location.pathname.startsWith('/dev/');
  const hasDedicatedEntitySeo = /^\/(clubs|hosts|resorts|cruises|venues)\/[^/]+$/.test(location.pathname)
    || /^\/events\/[^/]+$/.test(location.pathname)
    || /^\/(swinger-clubs|lifestyle-clubs|swinger-parties|lifestyle-events|play-parties)\/[^/]+$/.test(location.pathname);
  const isPrivateOrUtilityRoute = /^(\/admin|\/dev|\/account|\/host-dashboard|\/submission|\/login|\/signup|\/forgot-password|\/reset-password|\/listing\/|\/mobile|\/tablet)/.test(location.pathname);
  const seo = React.useMemo(() => resolvePageSeo(location.pathname), [location.pathname]);

  return (
    <AdminEditModeProvider>
    {!hasDedicatedEntitySeo ? (
      <Seo
        title={seo.title}
        description={seo.description}
        canonicalPath={seo.canonicalUrl}
        imageUrl={seo.imageUrl}
        imageAlt={seo.imageAlt}
        imageWidth={seo.imageWidth}
        imageHeight={seo.imageHeight}
        ogType={seo.ogType}
        noIndex={seo.noIndex || isPrivateOrUtilityRoute}
        structuredData={seo.structuredData}
      />
    ) : null}
    <div className="ss-bg-base relative min-h-screen font-sans text-gray-100 flex flex-col">
       {showDebugBadge ? <DebugBadge /> : null}
       <ToastContainer />
       <React.Suspense fallback={null}><AdminEditBar /></React.Suspense>
      <div className="ss-bg-geometric pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
      
      <div className={`relative z-10 flex flex-col flex-grow min-h-0 ${!isScrollablePage ? 'h-screen' : ''}`}>
        <Header 
          variant={location.pathname === '/' || isGlobeExperienceRoute ? 'landing' : 'default'}
          onAddListing={() => navigate('/submission')} 
          onHomeClick={() => navigate('/')}
          onLoginClick={() => navigate('/login')}
          onSignUpClick={() => navigate('/signup')}
          onAdminClick={() => navigate('/admin')}
          onHostDashboardClick={() => navigate('/host-dashboard')}
          onAccountClick={() => navigate('/account')}
          onMapClick={() => navigate(`/map${explorerScopeSearch}`)}
          onGlobeClick={() => navigate(`/globe${explorerScopeSearch}`)}
          onDirectoryClick={() => navigate('/discover')}
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
