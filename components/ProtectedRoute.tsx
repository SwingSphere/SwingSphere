import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../store/appStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: Array<'User' | 'Host' | 'Admin'>;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles }) => {
  const { currentUser, isAuthLoading, logout } = useAppStore();
  const location = useLocation();

  if (isAuthLoading) {
    return <div className="min-h-screen bg-black text-gray-400 flex items-center justify-center">Loading account…</div>;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (currentUser.status !== 'Active') {
    const isDeleted = currentUser.status === 'Deleted';
    return (
      <div className="min-h-screen bg-black px-6 text-gray-200 flex items-center justify-center">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl">
          <h1 className="text-2xl font-bold text-white">{isDeleted ? 'Account unavailable' : 'Account suspended'}</h1>
          <p className="mt-3 text-sm leading-6 text-gray-400">
            {isDeleted
              ? 'This SwingSphere account has been deleted and can no longer access member, host, or administrator areas.'
              : 'This SwingSphere account is suspended and cannot access member, host, or administrator areas while the suspension is active.'}
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-6 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.1]"
          >
            Log out
          </button>
        </div>
      </div>
    );
  }

  if (roles && !roles.includes(currentUser.role)) {
    return <Navigate to="/account" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
