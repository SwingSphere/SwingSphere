import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useEntityIndex } from '../../hooks/useEntityIndex';
import { parsePrettyKeyParam } from '../../lib/identityUtils';
import { formatEventTimeRange } from '../../lib/formatting';
import { getEventCanonicalPath } from '../../lib/entityUtils';
import { resolveBrandLogo } from '../../lib/entityBrandMedia';
import ClubDetailTemplate from '../club/ClubDetailTemplate';
import ClubPageAdminEditor from '../admin-edit/ClubPageAdminEditor';
import ClubQuickEditPanel, { type ClubQuickEditField } from '../admin-edit/ClubQuickEditPanel';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';
import { usePublicEditAccess } from '../admin-edit/usePublicEditAccess';

const ClubPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const key = parsePrettyKeyParam(slug ?? '');
  const { index, listings, venues, organizations, organizationVenueRelationships, isLoading, error } = useEntityIndex();

  const resolvedClub = index?.clubsByKey.get(key) ?? null;
  const { registerPublicPage, clearPublicPage } = useAdminEditMode();
  const { canEdit } = usePublicEditAccess({ postedByUserId: resolvedClub?.postedByUserId });
  const [clubOverride, setClubOverride] = useState<typeof resolvedClub>(null);
  const [quickEditField, setQuickEditField] = useState<ClubQuickEditField | null>(null);
  useEffect(() => {
    setClubOverride(null);
    setQuickEditField(null);
  }, [resolvedClub?.id]);
  useEffect(() => {
    if (!resolvedClub) return;
    registerPublicPage({
      entityId: resolvedClub.id,
      entityType: 'club',
      label: resolvedClub.name,
      canEdit,
      supportsInlineQuickEdit: true,
    });
    return () => clearPublicPage(resolvedClub.id);
  }, [canEdit, clearPublicPage, registerPublicPage, resolvedClub]);
  const club = clubOverride ?? resolvedClub;
  const presentationClub = useMemo(() => {
    if (!club) return null;
    const resolvedLogo = resolveBrandLogo('club', club.id, {
      listings,
      venues,
      organizations,
      relationships: organizationVenueRelationships,
    }).url;
    return resolvedLogo && resolvedLogo !== club.logoImageUrl ? { ...club, logoImageUrl: resolvedLogo } : club;
  }, [club, listings, organizationVenueRelationships, organizations, venues]);
  const clubKey = club && index?.clubKeyById.get(club.id) ? index.clubKeyById.get(club.id)! : key;

  const upcomingEvents = useMemo(() => {
    if (!club || !index) return [];
    const venueEvents = index.eventsByVenueClubKey.get(clubKey) ?? [];
    const now = Date.now();
    const upcoming = venueEvents
      .filter((event) => new Date(event.time.start).getTime() >= now)
      .sort((a, b) => new Date(a.time.start).getTime() - new Date(b.time.start).getTime())
      .slice(0, 12);
    return upcoming.map((event) => ({
      id: event.id,
      name: event.name,
      dateTime: formatEventTimeRange(event.time.start, event.time.end),
      city: [event.geopoint?.address?.city, event.geopoint?.address?.region].filter(Boolean).join(', ') || event.location || 'Location TBD',
      tags: event.tags ?? [],
      to: getEventCanonicalPath(event, index),
    }));
  }, [club, clubKey, index]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
        Loading club...
      </div>
    );
  }

  if (error || !index || !club) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
        Club not found.
      </div>
    );
  }

  return (
    <>
      <ClubQuickEditPanel
        key={`${club.id}-${quickEditField ?? 'closed'}`}
        club={club}
        field={quickEditField}
        onClose={() => setQuickEditField(null)}
        onPreview={setClubOverride}
        onSaved={setClubOverride}
      />
      <ClubDetailTemplate club={presentationClub ?? club} clubKey={clubKey} upcomingEvents={upcomingEvents} onQuickEdit={setQuickEditField} />
      <ClubPageAdminEditor club={club} />
    </>
  );
};

export default ClubPage;
