import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import { AppProvider } from '../../store/appStore';
import AdminInboundAnalytics from '../../components/admin/AdminInboundAnalytics';
import AdminOutboundAnalytics from '../../components/admin/AdminOutboundAnalytics';
import AdminMemberActivity from '../../components/admin/AdminMemberActivity';
import IssueReporter from '../../components/IssueReporter';
import AdminModerationQueue from '../../components/admin/AdminModerationQueue';
import AdminDashboard from '../../components/admin/AdminDashboard';
import AdminPanel from '../../components/admin/AdminPanel';

const params = new URLSearchParams(window.location.search);
const mode = params.get('mode');

createRoot(document.getElementById('root')!).render(
  <AppProvider>
    <MemoryRouter initialEntries={[params.get('route') || '/admin']}>
      {mode === 'admin-panel' ? (
        <AdminPanel initialView="dashboard" />
      ) : (
        <div className="min-h-screen bg-gray-100 p-4">
          {mode === 'report' ? (
            <>
              <IssueReporter />
              <div style={{ height: 1600 }}>Public page verification</div>
              {params.get('route')?.startsWith('/mobile') ? (
                <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 h-20 bg-black">
                  Mobile navigation
                </nav>
              ) : null}
            </>
          ) : mode === 'queue' ? (
            <AdminModerationQueue
              onDataChange={() => {}}
              mediaCatalog={{
                listings: [],
                venues: [],
                organizations: [],
                relationships: [],
                eventSeries: [],
                clubBrands: [],
                resorts: [],
                cruiseSeries: [],
                cruiseSailings: [],
              }}
            />
          ) : mode === 'activity' ? (
            <AdminMemberActivity
              user={{
                id: 'test-member',
                displayName: 'Test Member',
                role: 'User',
                status: 'Active',
                joinDate: '2026-10-01',
                profileVisibility: 'private',
                badgeCount: 0,
                publicBadgeCount: 0,
                organizationCount: 0,
                approvedReviewCount: 0,
                adminMetadataAvailable: true,
              }}
              onClose={() => {}}
            />
          ) : mode === 'dashboard' ? (
            <AdminDashboard setView={() => {}} allTags={[]} />
          ) : mode === 'inbound' ? (
            <AdminInboundAnalytics />
          ) : (
            <AdminOutboundAnalytics />
          )}
        </div>
      )}
    </MemoryRouter>
  </AppProvider>,
);
