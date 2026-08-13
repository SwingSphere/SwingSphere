import React from 'react';
import type { CruiseSailingData, CruiseSeriesData, EventData, Listing, OrganizationData, ResortData } from '../../types';
import type { EntityIndex } from '../../lib/entityIndex';
import ClubSidebar from './ClubSidebar';
import EventSidebar from './EventSidebar';
import HostSidebar from './HostSidebar';
import ResortSidebar from './ResortSidebar';
import CruiseSidebar from './CruiseSidebar';

interface ExplorerDetailsPanelProps {
  mode?: 'drawer' | 'embedded' | 'floating';
  selectedListingId?: string | null;
  selectedOrganizationId?: string | null;
  listings: Listing[];
  organizations: OrganizationData[];
  entityIndex?: EntityIndex;
  selectedTravel?: ResortData | { series: CruiseSeriesData; sailing?: CruiseSailingData | null } | null;
  onClose: () => void;
}

const ExplorerDetailsPanel: React.FC<ExplorerDetailsPanelProps> = ({
  mode = 'drawer',
  selectedListingId = null,
  selectedOrganizationId = null,
  listings,
  organizations,
  entityIndex,
  selectedTravel = null,
  onClose,
}) => {
  const listing = selectedListingId
    ? listings.find((candidate) => candidate.id === selectedListingId) ?? null
    : null;
  const organization = selectedOrganizationId
    ? organizations.find((candidate) => candidate.id === selectedOrganizationId) ?? null
    : null;

  if (selectedTravel) {
    if ('type' in selectedTravel && selectedTravel.type === 'resort') {
      return <ResortSidebar resort={selectedTravel} onClose={onClose} mode={mode} />;
    }
    return <CruiseSidebar series={selectedTravel.series} sailing={selectedTravel.sailing} onClose={onClose} mode={mode} />;
  }

  if (organization) {
    const events = listings.filter((candidate): candidate is EventData =>
      candidate.type === 'event' && candidate.organizerOrganizationId === organization.id);
    return <HostSidebar organization={organization} events={events} onClose={onClose} entityIndex={entityIndex} mode={mode} />;
  }

  if (listing?.type === 'event') {
    return <EventSidebar event={listing} onClose={onClose} entityIndex={entityIndex} mode={mode} />;
  }

  return (
    <ClubSidebar
      mode={mode}
      isOpen={Boolean(listing)}
      onClose={onClose}
      selectedListingId={listing?.type === 'club' ? listing.id : null}
      listings={listings}
      entityIndex={entityIndex}
    />
  );
};

export default ExplorerDetailsPanel;
