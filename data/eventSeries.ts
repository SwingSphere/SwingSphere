import type { EventSeriesData } from '../types';

export const eventSeries: EventSeriesData[] = [
  {
    id: 'series-connect-dance-love',
    type: 'event_series',
    name: 'Connect.Dance.Love',
    slug: 'connect-dance-love',
    descriptionShort: 'A recurring Bay Area social and dance event series.',
    status: 'approved',
    postedByUserId: 'user1',
  },
  {
    id: 'series-her-fantasy',
    type: 'event_series',
    name: 'Her Fantasy Party',
    slug: 'her-fantasy',
    organizerOrganizationId: 'org-promoter-her-fantasy-party',
    descriptionShort: 'A women-centered recurring lifestyle event series welcoming couples, single women and screened single men.',
    defaultVenueId: 'venue-club-twist-sf',
    defaultTags: ['Couples Welcome', 'Single Women Welcome', 'Single Men Welcome'],
    status: 'approved',
    postedByUserId: 'user1',
  },
  {
    id: 'series-bronze-party',
    type: 'event_series',
    name: 'Bronze Party',
    slug: 'bronze-party',
    organizerOrganizationId: 'org-promoter-bronze-party',
    descriptionShort: 'A recurring screened lifestyle event series for couples and single women, presented at multiple venues.',
    defaultTags: ['Couples Welcome', 'Single Women Welcome', 'No Single Men'],
    status: 'approved',
    postedByUserId: 'user1',
  },
];

export default eventSeries;
