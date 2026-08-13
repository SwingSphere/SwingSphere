import React, { useState, useEffect } from 'react';
import type { Review } from '../types';
import * as api from '../lib/api';
import MemberAttributionLink from './profile/MemberAttributionLink';

const ThumbsUpIcon: React.FC<{ filled?: boolean }> = ({ filled }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${filled ? 'text-green-400' : 'text-gray-600'}`} viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333V17h8.258-3.086a2 2 0 01-1.523-.727l-4.286-5.714a2 2 0 01.12-2.673A1.996 1.996 0 018 6h6.5a2 2 0 012 2v6a2 2 0 01-2 2H6v-1.707z" />
    </svg>
);
const ThumbsDownIcon: React.FC<{ filled?: boolean }> = ({ filled }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${filled ? 'text-red-400' : 'text-gray-600'}`} viewBox="0 0 20 20" fill="currentColor">
        <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667V3H5.742l3.086 4.114a2 2 0 01.12 2.673A1.996 1.996 0 018 14H1.5a2 2 0 01-2-2v-6a2 2 0 012-2H14v1.707z" />
    </svg>
);


const ReviewCard: React.FC<{ review: Review }> = ({ review }) => (
    <div className="flex items-start space-x-4 py-4 border-b border-gray-800 last:border-b-0">
        <img src={review.userAvatarUrl} alt={review.userName} className="w-10 h-10 rounded-full bg-gray-700" />
        <div className="flex-1">
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-semibold text-gray-100"><MemberAttributionLink displayName={review.userName} handle={review.userHandle} /></p>
                    <p className="text-xs text-gray-500">{new Date(review.timestamp).toLocaleDateString()}</p>
                </div>
                {review.rating === 'up' ? <ThumbsUpIcon filled /> : <ThumbsDownIcon filled />}
            </div>
            {review.text.trim() ? <p className="mt-2 text-sm text-gray-400">{review.text}</p> : null}
        </div>
    </div>
);


const ReviewList: React.FC<{ listingId: string }> = ({ listingId }) => {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        api.getReviews(listingId).then(data => {
            setReviews(data);
            setIsLoading(false);
        }).catch(() => setIsLoading(false));
    }, [listingId]);

    if (isLoading) {
        return <div className="text-sm text-gray-500">Loading reviews...</div>;
    }

    if (reviews.length === 0) {
        return <div className="text-sm text-gray-500 text-center py-4">No reviews yet. Be the first!</div>;
    }

    return (
        <div>
            <h3 className="font-semibold text-red-400 mb-2">Community Reviews</h3>
            <div>
                {reviews.map(review => (
                    <ReviewCard key={review.id} review={review} />
                ))}
            </div>
        </div>
    );
};

export default ReviewList;
