import React from 'react';
import { Navigate } from 'react-router-dom';
import ClubDetailTemplate from '../club/ClubDetailTemplate';
import { isDevRouteEnabled } from '../../lib/devRoutes';
import type { ClubData } from '../../types';

const MOCK_CLUB: ClubData & { logoImageUrl?: string; houseRules?: string } = {
  id: 'club-dev-template',
  type: 'club',
  name: 'Club Template Demo',
  description_short:
    'A stable mock venue profile used for design and regression checks. This copy is intentionally neutral and infrastructure-focused.',
  location: 'Downtown, Los Angeles, CA',
  website: 'https://example.com/club-template',
  contactEmail: 'template@swingsphere.local',
  geopoint: {
    latitude: 34.0522,
    longitude: -118.2437,
    address: {
      city: 'Los Angeles',
      region: 'CA',
      country: 'USA',
    },
  },
  schedule: [
    { day: 'Thursday', isClosed: false, open: '20:00', close: '01:00' },
    { day: 'Friday', isClosed: false, open: '21:00', close: '02:00' },
    { day: 'Saturday', isClosed: false, open: '21:00', close: '03:00' },
  ],
  generalAmenities: ['Lounge', 'Dance Floor', 'BYOB', 'Newbie Friendly'],
  headerImageUrl: 'https://picsum.photos/seed/club-template-hero/1400/900',
  galleryImageUrls: [
    'https://picsum.photos/seed/club-template-1/500/380',
    'https://picsum.photos/seed/club-template-2/500/380',
    'https://picsum.photos/seed/club-template-3/500/380',
    'https://picsum.photos/seed/club-template-4/500/380',
  ],
  logoImageUrl: 'https://picsum.photos/seed/club-template-logo/200/200',
  houseRules:
    'Respect consent boundaries, venue staff guidance, and posted space-use expectations. Keep communication direct and courteous.',
  status: 'approved',
  postedByUserId: 'user-001',
};

const DevClubTemplatePage: React.FC = () => {
  if (!isDevRouteEnabled()) {
    return <Navigate to="/" replace />;
  }

  return (
    <ClubDetailTemplate
      club={MOCK_CLUB}
      clubKey="dev-club-template"
      upcomingEvents={[]}
    />
  );
};

export default DevClubTemplatePage;
