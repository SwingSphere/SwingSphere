import React, { useEffect, useMemo } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Footer from './Footer';
import { useAppStore } from '../store/appStore';
import { useProfilePrivacy } from '../hooks/useProfilePrivacy';
import MemberHubLayout from './account/MemberHubLayout';
import AccountOverview from './account/AccountOverview';
import SavedLibrary from './account/SavedLibrary';
import ContributionsPage from './account/ContributionsPage';
import AchievementsPage from './account/AchievementsPage';
import PublicProfileSettings from './account/PublicProfileSettings';
import PrivacyVisibility from './account/PrivacyVisibility';
import AccountSettingsPage from './account/AccountSettingsPage';
import NotificationsPage from './account/NotificationsPage';

const AccountPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, addToast } = useAppStore();
  const privacy = useProfilePrivacy(currentUser?.id);

  useEffect(() => {
    if (!currentUser) navigate('/login', { replace: true });
  }, [currentUser, navigate]);

  const section = useMemo(() => {
    const relativePath = location.pathname.replace(/^\/account\/?/, '');
    return relativePath.split('/')[0] || 'overview';
  }, [location.pathname]);

  if (!currentUser) return null;

  const content = (() => {
    switch (section) {
      case 'overview':
        return <AccountOverview currentUser={currentUser} privacy={privacy.settings} />;
      case 'saved':
        return <SavedLibrary currentUser={currentUser} />;
      case 'contributions':
        return <ContributionsPage currentUser={currentUser} />;
      case 'achievements':
        return <AchievementsPage />;
      case 'public-profile':
        return (
          <PublicProfileSettings
            currentUser={currentUser}
            privacy={privacy.settings}
            isPrivacyLoading={privacy.isLoading}
          />
        );
      case 'privacy':
        return (
          <PrivacyVisibility
            privacy={privacy.settings}
            isLoading={privacy.isLoading}
            isSaving={privacy.isSaving}
            error={privacy.error}
            onSave={privacy.save}
            onSaved={(profileVisibility) => addToast({
              message: profileVisibility === 'visible'
                ? 'Profile visibility saved: visible by link.'
                : 'Profile visibility saved: private.',
              type: 'success',
            })}
          />
        );
      case 'notifications':
        return <NotificationsPage />;
      case 'settings':
        return <AccountSettingsPage currentUser={currentUser} />;
      default:
        return <Navigate to="/account" replace />;
    }
  })();

  return (
    <main className="ss-bg-geometric flex min-h-[calc(100vh-72px)] flex-grow flex-col overflow-y-auto">
      <MemberHubLayout
        currentUser={currentUser}
        privacy={privacy.settings}
        isPrivacyLoading={privacy.isLoading}
      >
        {content}
      </MemberHubLayout>
      <Footer compact />
    </main>
  );
};

export default AccountPage;
