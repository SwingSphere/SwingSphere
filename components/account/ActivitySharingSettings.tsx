import React, { useEffect, useState } from 'react';
import { getMemberActivitySharing, setMemberActivitySharing } from '../../lib/analytics/memberActivity';

const ActivitySharingSettings: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    getMemberActivitySharing().then((value) => { if (active) setEnabled(value); })
      .catch(() => { if (active) setError('Activity sharing is unavailable. No shared activity history is enabled through this setting.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const change = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      const next = await setMemberActivitySharing(!enabled);
      setEnabled(next);
      setMessage(next ? 'Activity sharing enabled.' : 'Sharing disabled. Recorded history cleared; your saves remain in your library.');
    } catch {
      setError('Could not save this setting. Your previous choice remains in effect.');
    } finally { setSaving(false); }
  };
  return (
    <section className="ss-glass-surface rounded-[26px] p-6 sm:p-8">
      <h3 className="text-xl font-bold text-white">Share activity with SwingSphere administrators</h3>
      <p className="mt-3 text-sm leading-6 text-gray-400">Optional and off by default. When enabled, authorized SwingSphere administrators can see your public discovery page visits, outbound actions, save/remove actions, and the places and events currently in your saved library, including existing saves. Recorded history covers the last 30 days, starting when you enable sharing. Private notes, collections, account pages, search text, and member-profile visits are excluded. This information is never shown to promoters or on your public profile.</p>
      <p className="mt-2 text-xs leading-5 text-gray-500">Turn it off at any time to stop recording, clear this activity history, and hide your saves from this admin view. Your saved library stays intact.</p>
      <button type="button" role="switch" aria-checked={enabled} disabled={loading || saving} onClick={() => void change()} className="mt-5 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Loading…' : saving ? 'Saving…' : enabled ? 'Activity sharing: On — turn off' : 'Activity sharing: Off — turn on'}</button>
      {error ? <p role="alert" className="mt-3 text-sm text-red-200">{error}</p> : null}
      {message ? <p role="status" className="mt-3 text-sm text-gray-300">{message}</p> : null}
    </section>
  );
};
export default ActivitySharingSettings;
