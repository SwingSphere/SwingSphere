import React from 'react';
import { Pencil } from 'lucide-react';
import type { AttendancePolicy, DaySchedule, EntryRequirement } from '../../types';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';
import { formatEntryRequirements, getAudienceLabel } from '../../lib/accessDisplay';
import { formatClockTime } from '../../lib/formatting';

type ClubRhythmSectionProps = {
  schedule: DaySchedule[];
  summary: string;
  specialScheduleNotes?: string;
  attendancePolicy?: AttendancePolicy;
  entryRequirements?: EntryRequirement[];
  calendarHref: string;
  onQuickEdit?: () => void;
};

const audienceRule = /^(?:Couples (?:Only|Welcome|Focused)|Single (?:Women|Men) Welcome|Solo (?:Women|Men) Welcome|Women Only|Men Only|Men Welcome|Bisexual Men Welcome|M\/F\/F Trios Welcome|No (?:Solo|Single) Men(?: Under Standard Policy)?|Limited (?:Pre-Approved |Screened )?Single Men(?: by Advance Booking)?|Approved Single Men Welcome|Single Men With Sponsoring Couple|Selected Single Men Only|Selected Mixed Bisexual Events)$/i;
const programRule = /^(?:Erotic Yoga|Lingerie Night|Discovery Night|Cuckold and Swinger Night|Theme Party|Themed adult event|Daytime events and rendezvous sessions|Sapphic Aquatica on Selected Mondays|Selected Her Fantasy Events|Recurring Group Orgy Event)$/i;
const occasionalRule = /^(?:Selected Event Dates|Select Saturdays|Selected Sundays Only|Selected Her Fantasy Events)$/i;
const genericRule = /^(?:Check Event Calendar|Weekly Event|Attendance Varies(?: by Event)?|Event Format Varies|Varies by Event)$/i;

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));
const formatScheduleNotes = (notes: string) => notes.replace(
  /\b(\d{1,2}:\d{2})(\s*(?:a\.?m\.?|p\.?m\.?))?/gi,
  (_match, time: string, meridiem: string | undefined) =>
    meridiem ? `${time}${meridiem}` : time === '24:00' ? '12 AM' : formatClockTime(time),
);

const audiencePills = (entry: DaySchedule, clubPolicy?: AttendancePolicy): string[] => {
  const rules = entry.rules ?? [];
  const text = entry.audienceDetails?.trim() || rules.filter((rule) => audienceRule.test(rule)).join(' · ');
  const policy = entry.attendancePolicy ?? clubPolicy;
  const fromPolicy = !text && policy && !['varies_by_night', 'varies_by_event'].includes(policy);
  if (fromPolicy) {
    if (policy === 'couples_only') return ['Couples'];
    if (policy === 'couples_and_single_women') return ['Couples', 'Single women'];
    if (policy === 'couples_and_select_single_men') return ['Couples', 'Single men (limited)'];
    if (policy === 'women_only') return ['Single women'];
    if (policy === 'men_only') return ['Single men'];
  }
  const source = text || (fromPolicy ? getAudienceLabel(policy) : '');
  if (!source) return [];

  const pills: string[] = [];
  const add = (label: string) => { if (!pills.includes(label)) pills.push(label); };
  if (/\bcouples?\b/i.test(source)) add('Couples');
  if (/(?:single|solo) women|single ladies|women only/i.test(source)) add('Single women');
  const menExcluded = /no (?:single|solo) men|single men (?:not admitted|not allowed)/i.test(source);
  const menIncluded = /(?:single|solo) men (?:welcome|may attend)|approved single men|limited (?:pre-approved |screened )?single men|single men with sponsoring couple|selected single men only/i.test(source);
  if (menIncluded && !menExcluded) {
    add(/limited|select/i.test(source) ? 'Single men (limited)' : /approved|screened/i.test(source) ? 'Single men (approved)' : 'Single men');
  }
  if (/select singles/i.test(source)) add('Select singles');
  if (!pills.length) add(source.replace(/\bwelcome\b/gi, '').trim());
  return pills;
};

const getDayDetails = (entry: DaySchedule, clubPolicy?: AttendancePolicy) => {
  const rules = entry.rules ?? [];
  const program = entry.program?.trim() || rules.find((rule) => programRule.test(rule)) || '';
  const conditions = unique([
    ...(entry.entryConditions?.trim() ? [entry.entryConditions.trim()] : []),
    ...rules.filter((rule) =>
      !audienceRule.test(rule) && !programRule.test(rule) && !genericRule.test(rule) && !occasionalRule.test(rule)
      && rule !== entry.entryConditions?.trim()),
  ]);
  const occasional = entry.occurrence === 'selected_events'
    || (!entry.occurrence && rules.some((rule) => occasionalRule.test(rule)));
  return { pills: audiencePills(entry, clubPolicy), program, conditions, occasional };
};

const ClubRhythmSection: React.FC<ClubRhythmSectionProps> = ({
  schedule, summary, specialScheduleNotes, attendancePolicy, entryRequirements = [], calendarHref, onQuickEdit,
}) => {
  const { isEditing, isAdvancedEditorOpen } = useAdminEditMode();
  const showQuickControl = isEditing && !isAdvancedEditorOpen && Boolean(onQuickEdit);
  const activeDays = schedule.filter((entry) => !entry.isClosed).slice(0, 7);
  const days = activeDays.map((entry) => ({ entry, ...getDayDetails(entry, attendancePolicy) }));
  const commonConditions = days.length
    ? days[0].conditions.filter((condition) => days.every((day) => day.conditions.includes(condition)))
    : [];
  const generalRequirements = formatEntryRequirements(entryRequirements);
  const extraGeneralConditions = commonConditions.filter((condition) => {
    const normalized = condition.toLowerCase();
    if (generalRequirements.toLowerCase().includes(normalized)) return false;
    return !(normalized === 'membership and nightly fee required'
      && entryRequirements.includes('members_only')
      && entryRequirements.includes('nightly_fee_required' as EntryRequirement));
  });

  return (
    <section className="relative rounded-2xl border border-gray-800 bg-gray-900/65 p-5 sm:p-6">
      {showQuickControl ? <button type="button" onClick={onQuickEdit} className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white"><Pencil size={14} /> Edit schedule</button> : null}
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">Plan your visit</p>
      <h2 className="mt-1 text-xl font-semibold text-gray-100">When to Go &amp; Who Can Attend</h2>
      <p className="mt-2 text-sm text-gray-400">Regular operating days and hours. Event themes may change; check the calendar for the current night.</p>
      {days.length ? (
        <ul className="mt-4 space-y-2" aria-label="Club schedule">
          {days.map(({ entry, pills, program, conditions, occasional }) => (
            <li key={entry.day} className="ss-glass ss-glass--ambient grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 rounded-xl px-4 py-3 text-sm sm:grid-cols-[minmax(85px,0.55fr)_minmax(105px,0.8fr)_minmax(0,2fr)] sm:items-start sm:gap-4">
              <span className="font-semibold text-gray-100">
                {entry.day}
                {occasional ? <span className="mt-0.5 block text-[11px] font-normal text-gray-400">Selected dates</span> : null}
              </span>
              <span className="whitespace-nowrap text-right text-gray-300 sm:text-left">
                {entry.open && entry.close ? `${formatClockTime(entry.open)} – ${formatClockTime(entry.close)}` : 'Hours vary'}
              </span>
              <span className="col-span-2 min-w-0 sm:col-span-1">
                {program ? <span className="block font-medium text-red-200">{program}</span> : null}
                {pills.length ? (
                  <span className={`flex flex-wrap gap-1.5 ${program ? 'mt-2' : ''}`} aria-label={`Who can attend ${entry.day}: ${pills.join(', ')}`}>
                    {pills.map((pill) => <span key={pill} className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-0.5 text-xs font-medium text-gray-200">{pill}</span>)}
                  </span>
                ) : <span className="block text-xs text-gray-500">Audience details not listed</span>}
                {conditions.filter((condition) => !commonConditions.includes(condition)).length ? (
                  <span className="mt-1.5 block text-xs text-gray-400">
                    {conditions.filter((condition) => !commonConditions.includes(condition)).map(formatScheduleNotes).join(' · ')}
                  </span>
                ) : null}
                {occasional ? <a href={calendarHref} className="mt-1 inline-block text-xs font-semibold text-red-200 underline-offset-2 hover:underline">Check the event calendar</a> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 space-y-2 text-sm text-gray-300">
          <p>{summary}</p>
          {attendancePolicy && attendancePolicy !== 'varies_by_night' && attendancePolicy !== 'varies_by_event' ? <p>Who can attend: {getAudienceLabel(attendancePolicy)}</p> : null}
          <a href={calendarHref} className="inline-block text-red-200 underline-offset-2 hover:underline">Check the event calendar</a>
        </div>
      )}
      {entryRequirements.length ? (
        <p className="mt-4 text-sm text-gray-300"><span className="font-semibold text-gray-100">General entry requirements: </span>{generalRequirements}</p>
      ) : null}
      {extraGeneralConditions.length ? <p className="mt-2 text-sm text-gray-300">{extraGeneralConditions.map(formatScheduleNotes).join(' · ')}</p> : null}
      {specialScheduleNotes ? (
        <p className="mt-4 text-sm leading-6 text-gray-400">{formatScheduleNotes(specialScheduleNotes)}</p>
      ) : days.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Contact the club for current schedule details before visiting.</p>
      ) : null}
    </section>
  );
};

export default ClubRhythmSection;
