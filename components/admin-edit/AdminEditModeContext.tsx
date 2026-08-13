import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type AdminPageMode = 'viewing' | 'editing' | 'visitor';

export type PublicPageEditRegistration = {
  entityId: string;
  entityType: 'event' | 'club' | 'organization' | 'venue' | 'resort' | 'cruise' | 'profile';
  label: string;
  canEdit: boolean;
  supportsInlineQuickEdit: boolean;
};

type AdminEditModeContextValue = {
  mode: AdminPageMode;
  isEditing: boolean;
  isViewingAsVisitor: boolean;
  hasUnsavedChanges: boolean;
  isAdvancedEditorOpen: boolean;
  publicPage: PublicPageEditRegistration | null;
  setMode: (mode: AdminPageMode) => boolean;
  openAdvancedEditor: () => void;
  closeAdvancedEditor: () => void;
  markUnsaved: () => void;
  markSaved: () => void;
  registerPublicPage: (registration: PublicPageEditRegistration) => void;
  clearPublicPage: (entityId: string) => void;
};

const STORAGE_KEY = 'swingsphere.adminPageMode';

const AdminEditModeContext = createContext<AdminEditModeContextValue | null>(null);

const readInitialMode = (): AdminPageMode => {
  if (typeof window === 'undefined') return 'viewing';
  const stored = window.sessionStorage.getItem(STORAGE_KEY);
  return stored === 'editing' || stored === 'visitor' ? stored : 'viewing';
};

export const AdminEditModeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [mode, setModeState] = useState<AdminPageMode>(readInitialMode);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isAdvancedEditorOpen, setIsAdvancedEditorOpen] = useState(false);
  const [publicPage, setPublicPage] = useState<PublicPageEditRegistration | null>(null);

  const setMode = useCallback((nextMode: AdminPageMode) => {
    if (hasUnsavedChanges && nextMode !== 'editing' && typeof window !== 'undefined') {
      const shouldLeave = window.confirm('You have unsaved changes. Leave edit mode and discard them?');
      if (!shouldLeave) return false;
      setHasUnsavedChanges(false);
    }
    setModeState(nextMode);
    if (nextMode !== 'editing') setIsAdvancedEditorOpen(false);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(STORAGE_KEY, nextMode);
    }
    return true;
  }, [hasUnsavedChanges]);

  const openAdvancedEditor = useCallback(() => setIsAdvancedEditorOpen(true), []);
  const closeAdvancedEditor = useCallback(() => setIsAdvancedEditorOpen(false), []);
  const markUnsaved = useCallback(() => setHasUnsavedChanges(true), []);
  const markSaved = useCallback(() => setHasUnsavedChanges(false), []);
  const registerPublicPage = useCallback((registration: PublicPageEditRegistration) => {
    setPublicPage(registration);
  }, []);
  const clearPublicPage = useCallback((entityId: string) => {
    setPublicPage((current) => current?.entityId === entityId ? null : current);
  }, []);

  useEffect(() => {
    if (!hasUnsavedChanges || typeof window === 'undefined') return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const value = useMemo<AdminEditModeContextValue>(() => ({
    mode,
    isEditing: mode === 'editing',
    isViewingAsVisitor: mode === 'visitor',
    hasUnsavedChanges,
    isAdvancedEditorOpen,
    publicPage,
    setMode,
    openAdvancedEditor,
    closeAdvancedEditor,
    markUnsaved,
    markSaved,
    registerPublicPage,
    clearPublicPage,
  }), [
    clearPublicPage,
    closeAdvancedEditor,
    hasUnsavedChanges,
    isAdvancedEditorOpen,
    markSaved,
    markUnsaved,
    mode,
    openAdvancedEditor,
    publicPage,
    registerPublicPage,
    setMode,
  ]);

  return <AdminEditModeContext.Provider value={value}>{children}</AdminEditModeContext.Provider>;
};

export const useAdminEditMode = (): AdminEditModeContextValue => {
  const context = useContext(AdminEditModeContext);
  if (!context) {
    throw new Error('useAdminEditMode must be used within AdminEditModeProvider');
  }
  return context;
};
