import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import App from './App';
import './index.css';
import LandingPage from './components/LandingPage';
import ProtectedRoute from './components/ProtectedRoute';
import { AppProvider } from './store/appStore';
import ExplorerLayout from './components/explorer/ExplorerLayout';
import { ExplorerProvider } from './components/explorer/ExplorerProvider';
import { DEV_TOOLS_ENABLED } from './lib/devTools';
import ComingSoonPage from './components/ComingSoonPage';
import InboundAnalyticsTracker from './components/analytics/InboundAnalyticsTracker';
import { resolveBrowserDeviceExperience } from './lib/deviceExperience';

const ProductionGlobePage = React.lazy(() => import('./components/ProductionGlobePage'));
const ListingSubmissionForm = React.lazy(() => import('./components/ListingSubmissionForm'));
const PrivacyPolicy = React.lazy(() => import('./components/PrivacyPolicy'));
const AboutUs = React.lazy(() => import('./components/AboutUs'));
const FAQ = React.lazy(() => import('./components/FAQ'));
const ContactUs = React.lazy(() => import('./components/ContactUs'));
const TermsOfService = React.lazy(() => import('./components/TermsOfService'));
const LogIn = React.lazy(() => import('./components/LogIn'));
const SignUp = React.lazy(() => import('./components/SignUp'));
const AccountPage = React.lazy(() => import('./components/AccountPage'));
const PublicProfilePage = React.lazy(() => import('./components/PublicProfilePage'));
const ForgotPassword = React.lazy(() => import('./components/ForgotPassword'));
const ResetPassword = React.lazy(() => import('./components/ResetPassword'));
const AdminPanel = React.lazy(() => import('./components/admin/AdminPanel'));
const AdminMiniMapHybridTest = React.lazy(() => import('./components/admin/AdminMiniMapHybridTest'));
const AdminToolPage = React.lazy(() => import('./components/admin/AdminToolPage'));
const EventPage = React.lazy(() => import('./components/pages/EventPage'));
const EventsIndexPage = React.lazy(() => import('./components/pages/EventsIndexPage'));
const ClubPage = React.lazy(() => import('./components/pages/ClubPage'));
const HostPage = React.lazy(() => import('./components/pages/HostPage'));
const HostDashboard = React.lazy(() => import('./components/host/HostDashboard'));
const VenuePage = React.lazy(() => import('./components/pages/VenuePage'));
const TravelIndexPage = React.lazy(() => import('./components/pages/TravelIndexPage'));
const ResortPage = React.lazy(() => import('./components/pages/ResortPage'));
const CruisePage = React.lazy(() => import('./components/pages/CruisePage'));
const ListingRedirectPage = React.lazy(() => import('./components/pages/ListingRedirectPage'));

const DevSitemapPage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/DevSitemapPage')) : null;
const DevClubTemplatePage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/DevClubTemplatePage')) : null;
const DevTemplatesPage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/DevTemplatesPage')) : null;
const BuildingInspectorPage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/BuildingInspectorPage')) : null;
const BuildingCapturePage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/BuildingCapturePage')) : null;
const HeroCameraStudioPage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/HeroCameraStudioPage')) : null;
const LightingAuditPage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/LightingAuditPage')) : null;
const StreetViewPresentationPage = React.lazy(() => import('./components/dev/StreetViewToolPage').then((module) => ({ default: module.StreetViewPresentationPage })));
const StreetViewToolPage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/StreetViewToolPage')) : null;
const GlassMaterialLabPage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/GlassMaterialLabPage')) : null;
const LanguageExplorerGlobeLabPage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/LanguageExplorerGlobeLabPage')) : null;
const BadgeAchievementLabPage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/BadgeAchievementLabPage')) : null;
const LivingBackgroundLabPage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/LivingBackgroundLabPage')) : null;
const BorderSurgeryPage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/BorderSurgeryPage')) : null;
const CleanRoomGlobePage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/CleanRoomGlobePage')) : null;
const PinMarkerStudioPage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/PinMarkerStudioPage')) : null;
const DevImageLibraryPage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/DevImageLibraryPage')) : null;
const MobileExplorerWorkbenchPage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/MobileExplorerWorkbenchPage')) : null;
const TabletExplorerWorkbenchPage = import.meta.env.DEV ? React.lazy(() => import('./components/dev/TabletExplorerWorkbenchPage')) : null;
const DevMobileApp = React.lazy(() => import('./components/dev/mobile/DevMobileApp'));
const DevTabletApp = React.lazy(() => import('./components/dev/tablet/DevTabletApp'));

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: '#ff3b30', padding: '40px', backgroundColor: '#0a0a0a', minHeight: '100vh', fontFamily: 'sans-serif' }}>
          <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>Something went wrong.</h1>
          <pre style={{ backgroundColor: '#1a1a1a', padding: '20px', borderRadius: '8px', overflow: 'auto' }}>
            {this.state.error?.toString()}
          </pre>
          <p style={{ marginTop: '20px', color: '#888' }}>Check the console for more details.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

const root = ReactDOM.createRoot(rootElement);

const RootEntryPage: React.FC = () => {
  const experience = resolveBrowserDeviceExperience();
  if (experience === 'mobile') return <Navigate to="/mobile" replace />;
  if (experience === 'tablet') return <Navigate to="/tablet" replace />;
  return <LandingPage />;
};

const SITE_MODE = import.meta.env.VITE_SITE_MODE === 'coming-soon' ? 'coming-soon' : 'full';
const configuredBasename = import.meta.env.VITE_APP_BASENAME || undefined;
const APP_BASENAME = configuredBasename && window.location.pathname.startsWith(configuredBasename)
  ? configuredBasename
  : undefined;
console.log("Mounting React App...");
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      {SITE_MODE === 'coming-soon' ? (
        <ComingSoonPage />
      ) : (
      <AppProvider>
        <BrowserRouter basename={APP_BASENAME}>
          <InboundAnalyticsTracker />
          <React.Suspense fallback={<div className="min-h-[40vh] bg-[#030405]" aria-label="Loading SwingSphere" />}>
          <Routes>
            <Route
              path="/dev/mobile"
              element={DEV_TOOLS_ENABLED && MobileExplorerWorkbenchPage ? <ProtectedRoute roles={['Admin']}><MobileExplorerWorkbenchPage /></ProtectedRoute> : <Navigate to="/" replace />}
            />
            <Route
              path="/mobile/*"
              element={<DevMobileApp />}
            />
            <Route
              path="/dev/tablet"
              element={DEV_TOOLS_ENABLED && TabletExplorerWorkbenchPage ? <ProtectedRoute roles={['Admin']}><TabletExplorerWorkbenchPage /></ProtectedRoute> : <Navigate to="/" replace />}
            />
            <Route
              path="/tablet/*"
              element={<DevTabletApp />}
            />
            <Route path="/street-view" element={<StreetViewPresentationPage />} />
            <Route
              path="/dev/building-inspector"
              element={DEV_TOOLS_ENABLED && BuildingInspectorPage ? <ProtectedRoute roles={['Admin']}><BuildingInspectorPage /></ProtectedRoute> : <Navigate to="/" replace />}
            />
            <Route
              path="/dev/building-capture"
              element={DEV_TOOLS_ENABLED && BuildingCapturePage ? <ProtectedRoute roles={['Admin']}><BuildingCapturePage /></ProtectedRoute> : <Navigate to="/" replace />}
            />
            <Route path="/" element={<App />}>
              <Route index element={<RootEntryPage />} />
              <Route path="submission" element={<ProtectedRoute><ListingSubmissionForm /></ProtectedRoute>} />
              <Route path="submission/:listingId" element={<ProtectedRoute><ListingSubmissionForm /></ProtectedRoute>} />
              <Route element={<ExplorerLayout />}>
                <Route path="globe" element={<ProductionGlobePage />} />
                <Route
                  path="dev/globe"
                  element={DEV_TOOLS_ENABLED ? <ProtectedRoute roles={['Admin']}><ProductionGlobePage showDevTools /></ProtectedRoute> : <Navigate to="/globe" replace />}
                />
                <Route
                  path="dev/hybrid-globe"
                  element={DEV_TOOLS_ENABLED ? <ProtectedRoute roles={['Admin']}><ProductionGlobePage hybridPrototype /></ProtectedRoute> : <Navigate to="/globe" replace />}
                />
                <Route
                  path="dev/globe-v3-cleanroom"
                  element={DEV_TOOLS_ENABLED && CleanRoomGlobePage ? <ProtectedRoute roles={['Admin']}><CleanRoomGlobePage /></ProtectedRoute> : <Navigate to="/globe" replace />}
                />
                <Route
                  path="dev/language-explorer-globe"
                  element={DEV_TOOLS_ENABLED && LanguageExplorerGlobeLabPage ? <ProtectedRoute roles={['Admin']}><LanguageExplorerGlobeLabPage /></ProtectedRoute> : <Navigate to="/globe" replace />}
                />
                <Route
                  path="dev/pin-marker-studio"
                  element={DEV_TOOLS_ENABLED && PinMarkerStudioPage ? <ProtectedRoute roles={['Admin']}><PinMarkerStudioPage /></ProtectedRoute> : <Navigate to="/globe" replace />}
                />
                <Route path="map" element={<ProductionGlobePage />} />
                <Route path="explore" element={<Navigate to="/globe" replace />} />
              </Route>
              <Route path="privacy" element={<PrivacyPolicy />} />
              <Route path="about" element={<AboutUs />} />
              <Route path="faq" element={<FAQ />} />
              <Route path="contact" element={<ContactUs />} />
              <Route path="tos" element={<TermsOfService />} />
              <Route path="login" element={<LogIn />} />
              <Route path="signup" element={<SignUp />} />
              <Route path="account/*" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
              <Route path="host-dashboard" element={<ProtectedRoute><HostDashboard /></ProtectedRoute>} />
              <Route path="users/:handle" element={<PublicProfilePage />} />
              <Route path="forgot-password" element={<ForgotPassword />} />
              <Route path="reset-password" element={<ResetPassword />} />
              <Route path="admin" element={<ProtectedRoute roles={['Admin']}><AdminPanel /></ProtectedRoute>} />
              <Route path="admin/building-inspector" element={<ProtectedRoute roles={['Admin']}><AdminToolPage /></ProtectedRoute>} />
              <Route path="admin/minimap-hybrid-test" element={<ProtectedRoute roles={['Admin']}><AdminMiniMapHybridTest /></ProtectedRoute>} />
              <Route path="listing/:id" element={<ListingRedirectPage />} />
              <Route path="events" element={<EventsIndexPage />} />
              <Route path="events/:slug" element={<EventPage />} />
              <Route path="clubs/:slug" element={<ClubPage />} />
              <Route path="hosts/:hostSlug" element={<HostPage />} />
              <Route path="travel" element={<TravelIndexPage />} />
              <Route path="resorts/:slug" element={<ResortPage />} />
              <Route path="cruises/:slug" element={<CruisePage />} />
              {/* SEMv2 infrastructure route: keep routable, but do not promote from public discovery surfaces yet. */}
              <Route path="venues/:slug" element={<VenuePage />} />
              <Route
                path="dev/sitemap"
                element={DEV_TOOLS_ENABLED && DevSitemapPage ? <ProtectedRoute roles={['Admin']}><DevSitemapPage /></ProtectedRoute> : <Navigate to="/" replace />}
              />
              <Route
                path="dev/club-template"
                element={DEV_TOOLS_ENABLED && DevClubTemplatePage ? <ProtectedRoute roles={['Admin']}><DevClubTemplatePage /></ProtectedRoute> : <Navigate to="/" replace />}
              />
              <Route
                path="dev/templates"
                element={DEV_TOOLS_ENABLED && DevTemplatesPage ? <ProtectedRoute roles={['Admin']}><DevTemplatesPage /></ProtectedRoute> : <Navigate to="/" replace />}
              />
              <Route
                path="dev/images"
                element={DEV_TOOLS_ENABLED && DevImageLibraryPage ? <ProtectedRoute roles={['Admin']}><DevImageLibraryPage /></ProtectedRoute> : <Navigate to="/" replace />}
              />
              <Route
                path="dev/hero-camera"
                element={DEV_TOOLS_ENABLED && HeroCameraStudioPage ? <ProtectedRoute roles={['Admin']}><HeroCameraStudioPage /></ProtectedRoute> : <Navigate to="/" replace />}
              />
              <Route
                path="dev/lighting-audit"
                element={DEV_TOOLS_ENABLED && LightingAuditPage ? <ProtectedRoute roles={['Admin']}><LightingAuditPage /></ProtectedRoute> : <Navigate to="/" replace />}
              />
              <Route
                path="dev/street-view"
                element={DEV_TOOLS_ENABLED && StreetViewToolPage ? <ProtectedRoute roles={['Admin']}><StreetViewToolPage /></ProtectedRoute> : <Navigate to="/" replace />}
              />
              <Route
                path="dev/glass"
                element={DEV_TOOLS_ENABLED && GlassMaterialLabPage ? <ProtectedRoute roles={['Admin']}><GlassMaterialLabPage /></ProtectedRoute> : <Navigate to="/" replace />}
              />
              <Route
                path="dev/badges"
                element={DEV_TOOLS_ENABLED && BadgeAchievementLabPage ? <ProtectedRoute roles={['Admin']}><BadgeAchievementLabPage /></ProtectedRoute> : <Navigate to="/" replace />}
              />
              <Route
                path="dev/living-background"
                element={DEV_TOOLS_ENABLED && LivingBackgroundLabPage ? <ProtectedRoute roles={['Admin']}><LivingBackgroundLabPage /></ProtectedRoute> : <Navigate to="/" replace />}
              />
              <Route
                path="dev/border-surgery"
                element={DEV_TOOLS_ENABLED && BorderSurgeryPage ? <ProtectedRoute roles={['Admin']}><BorderSurgeryPage /></ProtectedRoute> : <Navigate to="/" replace />}
              />
            </Route>
          </Routes>
          </React.Suspense>
        </BrowserRouter>
      </AppProvider>
      )}
    </ErrorBoundary>
  </React.StrictMode>
);
