import React, { useState, useEffect } from 'react';
import type { Listing } from '../../types';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/appStore';

type AdminSubmissionsQueueProps = {
    onDataChange: () => void;
};

const AdminSubmissionsQueue: React.FC<AdminSubmissionsQueueProps> = ({ onDataChange }) => {
    const [pendingSubmissions, setPendingSubmissions] = useState<Listing[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { addToast } = useAppStore();

    useEffect(() => {
        setIsLoading(true);
        api.getPendingSubmissions().then(data => {
            setPendingSubmissions(data);
            setIsLoading(false);
        });
    }, []);

    const handleApprove = async (listing: Listing) => {
        if (window.confirm(`Approve "${listing.name}"?`)) {
            try {
                await api.approveSubmission(listing.id);
                addToast({ message: 'Submission approved.', type: 'success' });
                onDataChange(); // Notify parent to refetch all data
                setPendingSubmissions(prev => prev.filter(l => l.id !== listing.id)); // Optimistic update
            } catch (error) {
                addToast({ message: 'Failed to approve submission.', type: 'error' });
            }
        }
    };
    
    const handleReject = async (listing: Listing) => {
        if (window.confirm(`Reject and delete "${listing.name}"? This cannot be undone.`)) {
            try {
                await api.deleteListing(listing.id);
                addToast({ message: 'Submission rejected and deleted.', type: 'success' });
                onDataChange();
                setPendingSubmissions(prev => prev.filter(l => l.id !== listing.id));
            } catch (error) {
                addToast({ message: 'Failed to reject submission.', type: 'error' });
            }
        }
    };

    if (isLoading) {
        return <div>Loading submissions...</div>
    }

    return (
        <div>
            <h1 className="text-4xl font-bold text-gray-800 mb-8">Submissions Queue</h1>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name & Type</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                             <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted By</th>
                            <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {pendingSubmissions.map(listing => (
                            <tr key={listing.id} className="transition-colors duration-150 hover:bg-red-50/80">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">{listing.name}</div>
                                    <div className="text-sm text-gray-500 capitalize">{listing.type}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{listing.location}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{listing.postedByUserId}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button onClick={() => handleApprove(listing)} className="text-green-600 hover:text-green-900 font-semibold">Approve</button>
                                    <button onClick={() => handleReject(listing)} className="text-red-600 hover:text-red-900 ml-4 font-semibold">Reject</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {pendingSubmissions.length === 0 && (
                    <div className="text-center p-8 text-gray-500">
                        <h3 className="text-lg font-medium">The submission queue is empty!</h3>
                        <p>All user-submitted listings have been reviewed.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminSubmissionsQueue;
