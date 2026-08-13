import React, { useState, useEffect } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import Button from './Button';

type ReviewModalProps = {
    listingName: string;
    initialRating?: 'up' | 'down' | null;
    onClose: () => void;
    onSubmit: (rating: 'up' | 'down', text: string) => void;
};

const ReviewModal: React.FC<ReviewModalProps> = ({ listingName, initialRating = null, onClose, onSubmit }) => {
    const [rating, setRating] = useState<'up' | 'down' | null>(initialRating);
    const [text, setText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!rating) {
            alert('Please select a rating (thumbs up or down).');
            return;
        }
        setIsSubmitting(true);
        await onSubmit(rating, text);
        setIsSubmitting(false);
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="ss-glass ss-glass--liquid rounded-[24px] p-8 max-w-lg w-full" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold text-gray-100">Rate Your Experience At</h2>
                <p className="text-red-400 text-lg mb-6">{listingName}</p>

                <form onSubmit={handleSubmit}>
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Your Rating</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setRating('up')} className={`ss-glass ss-glass--ambient ss-glass--interactive flex items-center justify-center gap-3 rounded-2xl px-4 py-4 text-sm font-semibold ${rating === 'up' ? 'ring-2 ring-emerald-400/70 text-emerald-200' : 'text-gray-300'}`}>
                                <ThumbsUp className="h-7 w-7" aria-hidden="true" />
                                Thumbs up
                            </button>
                            <button type="button" onClick={() => setRating('down')} className={`ss-glass ss-glass--ambient ss-glass--interactive flex items-center justify-center gap-3 rounded-2xl px-4 py-4 text-sm font-semibold ${rating === 'down' ? 'ring-2 ring-red-400/70 text-red-200' : 'text-gray-300'}`}>
                                <ThumbsDown className="h-7 w-7" aria-hidden="true" />
                                Thumbs down
                            </button>
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-400 mb-1">Add details (optional)</label>
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            rows={4}
                            placeholder="Share details of your experience..."
                            className="w-full bg-gray-800 border border-gray-700 rounded-md py-2 px-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:outline-none"
                        />
                    </div>

                    <div className="flex justify-end gap-4 mt-8">
                        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                        <Button variant="primary" type="submit" disabled={!rating || isSubmitting}>
                            {isSubmitting ? 'Submitting...' : text.trim() ? 'Submit Review' : 'Submit Rating'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ReviewModal;
