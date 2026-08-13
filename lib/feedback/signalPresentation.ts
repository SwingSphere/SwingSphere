import {
  BadgeCheck,
  CalendarCheck2,
  ClipboardCheck,
  DoorOpen,
  Headphones,
  LayoutGrid,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Music2,
  PanelsTopLeft,
  RotateCcw,
  Scan,
  Scale,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { getFeedbackSignal, getFeedbackSignalLabel } from './promptRegistry';
import type { FeedbackSignalPolarity } from './types';

type FeedbackSignalPresentationDefinition = {
  shortLabel: string;
  icon: LucideIcon;
};

export type FeedbackSignalPresentation = FeedbackSignalPresentationDefinition & {
  signalId: string;
  fullLabel: string;
  description?: string;
};

export const FEEDBACK_SIGNAL_PRESENTATION: Record<string, FeedbackSignalPresentationDefinition> = {
  friendly_crowd: { shortLabel: 'Crowd', icon: Users },
  great_music: { shortLabel: 'Music', icon: Music2 },
  clear_communication: { shortLabel: 'Communication', icon: MessageSquareText },
  smooth_check_in: { shortLabel: 'Check-in', icon: DoorOpen },
  newcomer_friendly: { shortLabel: 'Newcomers', icon: UserRoundCheck },
  enough_social_space: { shortLabel: 'Social space', icon: MessageCircle },
  enough_play_space: { shortLabel: 'Play space', icon: Scan },
  clean_environment: { shortLabel: 'Cleanliness', icon: Sparkles },
  clear_rules: { shortLabel: 'Rules', icon: ClipboardCheck },
  matched_listing: { shortLabel: 'Listing accuracy', icon: BadgeCheck },
  helpful_staff: { shortLabel: 'Staff', icon: UserRoundCheck },
  smooth_entry: { shortLabel: 'Entry', icon: DoorOpen },
  clean_facilities: { shortLabel: 'Cleanliness', icon: Sparkles },
  useful_amenities: { shortLabel: 'Amenities', icon: LayoutGrid },
  privacy_respected: { shortLabel: 'Privacy', icon: ShieldCheck },
  good_layout: { shortLabel: 'Layout', icon: PanelsTopLeft },
  comfortable_social_areas: { shortLabel: 'Social space', icon: MessageCircle },
  adequate_play_areas: { shortLabel: 'Play space', icon: Scan },
  good_music: { shortLabel: 'Music', icon: Music2 },
  admission_policy_accurate: { shortLabel: 'Admission policy', icon: BadgeCheck },
  reliable_updates: { shortLabel: 'Updates', icon: Megaphone },
  organized_events: { shortLabel: 'Organization', icon: CalendarCheck2 },
  fair_screening: { shortLabel: 'Screening', icon: Scale },
  newcomer_support: { shortLabel: 'Newcomers', icon: UserRoundCheck },
  consistent_rules: { shortLabel: 'Rules', icon: ClipboardCheck },
  responsive_host: { shortLabel: 'Responsiveness', icon: Headphones },
  accurate_listings: { shortLabel: 'Listing accuracy', icon: BadgeCheck },
  handles_problems_well: { shortLabel: 'Problem handling', icon: Wrench },
  would_attend_again: { shortLabel: 'Return appeal', icon: RotateCcw },
};

export const getFeedbackSignalPresentation = (
  signalId: string,
  polarity: FeedbackSignalPolarity,
): FeedbackSignalPresentation | undefined => {
  const signal = getFeedbackSignal(signalId);
  if (!signal) return undefined;

  const presentation = FEEDBACK_SIGNAL_PRESENTATION[signalId] ?? {
    shortLabel: signal.shortLabel ?? signal.label,
    icon: Sparkles,
  };

  return {
    signalId,
    shortLabel: presentation.shortLabel,
    fullLabel: getFeedbackSignalLabel(signal, polarity),
    icon: presentation.icon,
    description: signal.description,
  };
};
