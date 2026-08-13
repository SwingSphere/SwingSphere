import React from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useContentVote } from '../../hooks/useContentVote';
import { useAppStore } from '../../store/appStore';

const ContentVoteControl: React.FC<{
  contentKey: string;
  baseUpvotes?: number;
  baseDownvotes?: number;
  className?: string;
  compact?: boolean;
}> = ({
  contentKey,
  baseUpvotes = 0,
  baseDownvotes = 0,
  className = '',
  compact = false,
}) => {
  const navigate = useNavigate();
  const { currentUser, addToast } = useAppStore();
  const votes = useContentVote({
    contentKey,
    userId: currentUser?.id,
    baseUpvotes,
    baseDownvotes,
  });

  const handleVote = (direction: 'up' | 'down') => {
    if (!currentUser) {
      addToast({ type: 'info', message: 'Sign in to vote on community content.' });
      navigate('/login');
      return;
    }
    votes.vote(direction);
  };

  return (
    <div className={`inline-flex items-center gap-0.5 border border-white/[0.08] bg-black/20 ${compact ? 'rounded-lg p-0.5' : 'rounded-xl p-1'} ${className}`} aria-label="Vote on this contribution">
      <button
        type="button"
        onClick={() => handleVote('up')}
        aria-pressed={votes.currentVote === 'up'}
        aria-label={`Upvote. ${votes.upvotes} upvotes`}
        title="Upvote"
        className={`inline-flex items-center gap-1.5 rounded-md font-semibold transition ${compact ? 'min-h-7 px-2 text-[11px]' : 'min-h-8 px-2.5 text-xs'} ${
          votes.currentVote === 'up'
            ? 'bg-emerald-500/12 text-emerald-200'
            : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200'
        }`}
      >
        <ThumbsUp size={13} className={votes.currentVote === 'up' ? 'fill-current' : ''} aria-hidden="true" />
        <span className="tabular-nums">{votes.upvotes}</span>
      </button>
      <span className="h-4 w-px bg-white/[0.08]" aria-hidden="true" />
      <button
        type="button"
        onClick={() => handleVote('down')}
        aria-pressed={votes.currentVote === 'down'}
        aria-label={`Downvote. ${votes.downvotes} downvotes`}
        title="Downvote"
        className={`inline-flex items-center gap-1.5 rounded-md font-semibold transition ${compact ? 'min-h-7 px-2 text-[11px]' : 'min-h-8 px-2.5 text-xs'} ${
          votes.currentVote === 'down'
            ? 'bg-rose-500/12 text-rose-200'
            : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200'
        }`}
      >
        <ThumbsDown size={13} className={votes.currentVote === 'down' ? 'fill-current' : ''} aria-hidden="true" />
        <span className="tabular-nums">{votes.downvotes}</span>
      </button>
    </div>
  );
};

export default ContentVoteControl;
