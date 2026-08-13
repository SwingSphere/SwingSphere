import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/appStore';

type PublicEditAccessOptions = {
  postedByUserId?: string | null;
  organizationIds?: Array<string | null | undefined>;
  profileUserId?: string | null;
};

export const usePublicEditAccess = ({
  postedByUserId,
  organizationIds = [],
  profileUserId,
}: PublicEditAccessOptions) => {
  const { currentUser } = useAppStore();
  const normalizedOrganizationIds = useMemo(
    () => Array.from(new Set(organizationIds.filter((id): id is string => Boolean(id)))),
    [organizationIds],
  );
  const hasActiveAccount = currentUser?.status === 'Active';
  const directAccess = Boolean(
    currentUser && hasActiveAccount && (
      currentUser.role === 'Admin' ||
      postedByUserId === currentUser.id ||
      profileUserId === currentUser.id
    )
  );
  const [hasOrganizationAccess, setHasOrganizationAccess] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (directAccess || !currentUser || !hasActiveAccount || !normalizedOrganizationIds.length) {
      setHasOrganizationAccess(false);
      setIsChecking(false);
      return;
    }

    let cancelled = false;
    setIsChecking(true);
    void supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', currentUser.id)
      .eq('status', 'active')
      .in('organization_id', normalizedOrganizationIds)
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('Could not resolve public-page organization edit access.', error);
          setHasOrganizationAccess(false);
        } else {
          setHasOrganizationAccess(Boolean(data?.length));
        }
        setIsChecking(false);
      });

    return () => { cancelled = true; };
  }, [currentUser, directAccess, hasActiveAccount, normalizedOrganizationIds]);

  return {
    canEdit: directAccess || hasOrganizationAccess,
    isChecking,
  };
};
