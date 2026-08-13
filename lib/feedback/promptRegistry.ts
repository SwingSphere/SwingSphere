import type {
  FeedbackSafetyConcernDefinition,
  FeedbackSignalDefinition,
  FeedbackSignalPolarity,
  FeedbackTargetType,
} from './types';

export const FEEDBACK_SIGNAL_REGISTRY_VERSION = 1;

export const FEEDBACK_SIGNAL_REGISTRY: FeedbackSignalDefinition[] = [
  {
    id: 'friendly_crowd',
    targetTypes: ['event'],
    label: 'Crowd experience',
    positiveLabel: 'Friendly crowd',
    improvementLabel: 'Friendlier crowd',
    category: 'atmosphere',
    polaritySupport: 'both',
  },
  {
    id: 'great_music',
    targetTypes: ['event'],
    label: 'Music',
    positiveLabel: 'Great music',
    improvementLabel: 'Better music fit',
    category: 'atmosphere',
    polaritySupport: 'both',
  },
  {
    id: 'clear_communication',
    targetTypes: ['event', 'organization'],
    label: 'Communication',
    positiveLabel: 'Clear communication',
    improvementLabel: 'Clearer communication',
    category: 'communication',
    polaritySupport: 'both',
  },
  {
    id: 'smooth_check_in',
    targetTypes: ['event'],
    label: 'Check-in',
    positiveLabel: 'Smooth check-in',
    improvementLabel: 'Smoother check-in',
    category: 'arrival',
    polaritySupport: 'both',
  },
  {
    id: 'newcomer_friendly',
    targetTypes: ['event'],
    label: 'Newcomer experience',
    positiveLabel: 'Newcomer friendly',
    improvementLabel: 'More newcomer support',
    category: 'hospitality',
    polaritySupport: 'both',
  },
  {
    id: 'enough_social_space',
    targetTypes: ['event'],
    label: 'Social space',
    positiveLabel: 'Enough social space',
    improvementLabel: 'More social space',
    category: 'space',
    polaritySupport: 'both',
  },
  {
    id: 'enough_play_space',
    targetTypes: ['event'],
    label: 'Play space',
    positiveLabel: 'Enough play space',
    improvementLabel: 'More play space',
    category: 'space',
    polaritySupport: 'both',
  },
  {
    id: 'clean_environment',
    targetTypes: ['event'],
    label: 'Environment',
    positiveLabel: 'Clean environment',
    improvementLabel: 'Cleaner environment',
    category: 'venue',
    polaritySupport: 'both',
  },
  {
    id: 'clear_rules',
    targetTypes: ['event'],
    label: 'Rules and expectations',
    positiveLabel: 'Clear rules',
    improvementLabel: 'Clearer rules',
    category: 'expectations',
    polaritySupport: 'both',
  },
  {
    id: 'matched_listing',
    targetTypes: ['event'],
    label: 'Listing accuracy',
    positiveLabel: 'Matched the listing',
    improvementLabel: 'More accurate listing',
    category: 'accuracy',
    polaritySupport: 'both',
  },
  {
    id: 'helpful_staff',
    targetTypes: ['club'],
    label: 'Staff',
    positiveLabel: 'Helpful staff',
    improvementLabel: 'More helpful staff',
    category: 'hospitality',
    polaritySupport: 'both',
  },
  {
    id: 'smooth_entry',
    targetTypes: ['club'],
    label: 'Entry',
    positiveLabel: 'Smooth entry',
    improvementLabel: 'Smoother entry',
    category: 'arrival',
    polaritySupport: 'both',
  },
  {
    id: 'clean_facilities',
    targetTypes: ['club'],
    label: 'Facilities',
    positiveLabel: 'Clean facilities',
    improvementLabel: 'Cleaner facilities',
    category: 'facilities',
    polaritySupport: 'both',
  },
  {
    id: 'useful_amenities',
    targetTypes: ['club'],
    label: 'Amenities',
    positiveLabel: 'Useful amenities',
    improvementLabel: 'More useful amenities',
    category: 'facilities',
    polaritySupport: 'both',
  },
  {
    id: 'privacy_respected',
    targetTypes: ['club'],
    label: 'Privacy practices',
    positiveLabel: 'Privacy respected',
    improvementLabel: 'Stronger privacy practices',
    category: 'privacy',
    polaritySupport: 'both',
  },
  {
    id: 'good_layout',
    targetTypes: ['club'],
    label: 'Layout',
    positiveLabel: 'Good layout',
    improvementLabel: 'Better layout',
    category: 'space',
    polaritySupport: 'both',
  },
  {
    id: 'comfortable_social_areas',
    targetTypes: ['club'],
    label: 'Social areas',
    positiveLabel: 'Comfortable social areas',
    improvementLabel: 'More comfortable social areas',
    category: 'space',
    polaritySupport: 'both',
  },
  {
    id: 'adequate_play_areas',
    targetTypes: ['club'],
    label: 'Play areas',
    positiveLabel: 'Adequate play areas',
    improvementLabel: 'Better play areas',
    category: 'space',
    polaritySupport: 'both',
  },
  {
    id: 'good_music',
    targetTypes: ['club'],
    label: 'Music',
    positiveLabel: 'Good music',
    improvementLabel: 'Better music fit',
    category: 'atmosphere',
    polaritySupport: 'both',
  },
  {
    id: 'admission_policy_accurate',
    targetTypes: ['club'],
    label: 'Admission policy',
    positiveLabel: 'Accurate admission policy',
    improvementLabel: 'Clearer admission policy',
    category: 'accuracy',
    polaritySupport: 'both',
  },
  {
    id: 'reliable_updates',
    targetTypes: ['organization'],
    label: 'Updates',
    positiveLabel: 'Reliable updates',
    improvementLabel: 'More reliable updates',
    category: 'communication',
    polaritySupport: 'both',
  },
  {
    id: 'organized_events',
    targetTypes: ['organization'],
    label: 'Organization',
    positiveLabel: 'Organized events',
    improvementLabel: 'More organized events',
    category: 'operations',
    polaritySupport: 'both',
  },
  {
    id: 'fair_screening',
    targetTypes: ['organization'],
    label: 'Screening',
    positiveLabel: 'Fair screening',
    improvementLabel: 'Fairer screening',
    category: 'access',
    polaritySupport: 'both',
  },
  {
    id: 'newcomer_support',
    targetTypes: ['organization'],
    label: 'Newcomer support',
    positiveLabel: 'Strong newcomer support',
    improvementLabel: 'More newcomer support',
    category: 'hospitality',
    polaritySupport: 'both',
  },
  {
    id: 'consistent_rules',
    targetTypes: ['organization'],
    label: 'Rule consistency',
    positiveLabel: 'Consistent rules',
    improvementLabel: 'More consistent rules',
    category: 'expectations',
    polaritySupport: 'both',
  },
  {
    id: 'responsive_host',
    targetTypes: ['organization'],
    label: 'Responsiveness',
    positiveLabel: 'Responsive host',
    improvementLabel: 'More responsive host',
    category: 'communication',
    polaritySupport: 'both',
  },
  {
    id: 'accurate_listings',
    targetTypes: ['organization'],
    label: 'Listing accuracy',
    positiveLabel: 'Accurate listings',
    improvementLabel: 'More accurate listings',
    category: 'accuracy',
    polaritySupport: 'both',
  },
  {
    id: 'handles_problems_well',
    targetTypes: ['organization'],
    label: 'Problem handling',
    positiveLabel: 'Handles problems well',
    improvementLabel: 'Better problem handling',
    category: 'operations',
    polaritySupport: 'both',
  },
  {
    id: 'would_attend_again',
    targetTypes: ['organization'],
    label: 'Future attendance',
    positiveLabel: 'Would attend again',
    improvementLabel: 'More reason to return',
    category: 'overall',
    polaritySupport: 'both',
  },
];

export const FEEDBACK_SAFETY_CONCERNS: FeedbackSafetyConcernDefinition[] = [
  { id: 'consent_concern', label: 'Consent concern', description: 'A concern about consent, boundaries, or rule enforcement.' },
  { id: 'harassment', label: 'Harassment', description: 'Unwanted or intimidating conduct that needs private review.' },
  { id: 'privacy_violation', label: 'Privacy violation', description: 'Photography, disclosure, or handling of personal information.' },
  { id: 'discrimination', label: 'Discrimination', description: 'Unfair treatment connected to identity or protected characteristics.' },
  { id: 'unsafe_venue_conditions', label: 'Unsafe venue conditions', description: 'A physical venue condition that may create immediate risk.' },
  { id: 'coercive_behavior', label: 'Coercive behavior', description: 'Pressure, manipulation, or behavior that undermined free choice.' },
];

const supportsPolarity = (definition: FeedbackSignalDefinition, polarity: FeedbackSignalPolarity) => (
  definition.polaritySupport === 'both' || definition.polaritySupport === polarity
);

export const getFeedbackSignals = (
  targetType: FeedbackTargetType,
  polarity: FeedbackSignalPolarity,
): FeedbackSignalDefinition[] => FEEDBACK_SIGNAL_REGISTRY.filter((definition) => (
  definition.targetTypes.includes(targetType)
  && supportsPolarity(definition, polarity)
  && !definition.safetySensitive
));

export const getFeedbackSignal = (signalId: string): FeedbackSignalDefinition | undefined => (
  FEEDBACK_SIGNAL_REGISTRY.find((definition) => definition.id === signalId)
);

export const getFeedbackSignalLabel = (
  definition: FeedbackSignalDefinition,
  polarity: FeedbackSignalPolarity,
): string => (
  polarity === 'positive'
    ? definition.positiveLabel ?? definition.shortLabel ?? definition.label
    : definition.improvementLabel ?? definition.shortLabel ?? definition.label
);

export const isSafetyConcernCategory = (categoryId: string): boolean => (
  FEEDBACK_SAFETY_CONCERNS.some((definition) => definition.id === categoryId)
);
