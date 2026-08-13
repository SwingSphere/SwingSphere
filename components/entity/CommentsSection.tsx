import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import MemberAttributionLink from '../profile/MemberAttributionLink';

type Comment = {
  id: string;
  text: string;
  createdAt: string;
  authorDisplayName?: string;
  authorHandle?: string;
};

type CommentsSectionProps = {
  entityKey: string;
  entityType: 'event' | 'club' | 'host';
  emptyLabel: string;
  helperText?: string;
  placeholder?: string;
  submitLabel?: string;
};

const getStorageKey = (entityType: string, entityKey: string) =>
  `comments:${entityType}:${entityKey}`;

const CommentsSection: React.FC<CommentsSectionProps> = ({
  entityKey,
  entityType,
  emptyLabel,
  helperText,
  placeholder = 'Add a quick note...',
  submitLabel = 'Post Note',
}) => {
  const { currentUser } = useAppStore();
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(getStorageKey(entityType, entityKey));
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Comment[];
        if (Array.isArray(parsed)) setComments(parsed);
      } catch {
        // ignore corrupt data
      }
    }
  }, [entityKey, entityType]);

  const persist = (next: Comment[]) => {
    setComments(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(getStorageKey(entityType, entityKey), JSON.stringify(next));
    }
  };

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (!trimmed || !currentUser) return;
    const next = [
      {
        id: `${Date.now()}`,
        text: trimmed,
        createdAt: new Date().toISOString(),
        authorDisplayName: currentUser.displayName,
        authorHandle: currentUser.handle,
      },
      ...comments,
    ];
    persist(next);
    setDraft('');
  };

  return (
    <section className="bg-gray-900/70 border border-gray-800 rounded-xl p-4">
      <h2 className="text-lg font-semibold text-gray-100 mb-3">Community Notes</h2>
      {helperText ? <p className="text-xs text-gray-400 mb-3">{helperText}</p> : null}
      {comments.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyLabel}</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-3 text-sm text-gray-200">
              <p>{comment.text}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                <MemberAttributionLink displayName={comment.authorDisplayName} handle={comment.authorHandle} />
                <span aria-hidden="true">·</span>
                <span>{new Date(comment.createdAt).toLocaleDateString()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        {currentUser ? (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder={placeholder}
              className="w-full bg-black/40 border border-gray-800 rounded-lg p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500/40"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-gray-500">Posts as <span className="text-gray-300">{currentUser.displayName}</span> @{currentUser.handle}</p>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!draft.trim()}
                className="min-h-11 rounded-xl px-3 text-sm font-semibold text-red-300 transition hover:text-red-200 disabled:cursor-not-allowed disabled:text-gray-600"
              >
                {submitLabel}
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-white/[0.08] bg-black/25 p-4 text-sm text-gray-400">
            <Link to="/login" className="font-bold text-red-300 hover:text-red-200">Sign in</Link> to comment. Your display name and @username will be shown with the comment; your profile stays private unless you publish it.
          </div>
        )}
      </div>
    </section>
  );
};

export default CommentsSection;
