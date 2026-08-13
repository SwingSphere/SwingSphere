import React, { useState, useEffect } from 'react';
import type { FlaggedContent } from '../../data/mockFlaggedContent';
import { AdminView } from './AdminPanel';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/appStore';

type AdminModerationQueueProps = {
    onDataChange: () => void;
    setView: (view: AdminView) => void;
};

const AdminModerationQueue: React.FC<AdminModerationQueueProps> = ({ onDataChange, setView }) => {
    const [flaggedContent, setFlaggedContent] = useState<FlaggedContent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { addToast } = useAppStore();
    
    useEffect(() => {
        setIsLoading(true);
        api.getFlaggedContent().then(data => {
            setFlaggedContent(data);
            setIsLoading(false);
        });
    }, []);

    const handleDismiss = async (flagId: string, summary: string) => {
        if (window.confirm(`Dismiss the flag for: "${summary}"?`)) {
            try {
                await api.dismissFlag(flagId);
                addToast({ message: 'Flag dismissed.', type: 'info' });
                onDataChange();
                setFlaggedContent(prev => prev.filter(f => f.id !== flagId));
            } catch (error) {
                 addToast({ message: 'Failed to dismiss flag.', type: 'error' });
            }
        }
    };

    const handleApproveFlag = async (flag: FlaggedContent) => {
        if (window.confirm(`Approving this flag will DELETE the content: "${flag.summary}". Are you sure?`)) {
            try {
                await api.approveFlag(flag.id);
                addToast({ message: 'Flag approved and content deleted.', type: 'success' });
                onDataChange();
                setFlaggedContent(prev => prev.filter(f => f.id !== flag.id));
            } catch (error) {
                addToast({ message: 'Failed to approve flag.', type: 'error' });
            }
        }
    };
    
    const handleEdit = (item: FlaggedContent) => {
        if (item.type === 'Club') setView({ view: 'edit-club', clubId: item.contentId });
        else if (item.type === 'Event') setView({ view: 'edit-event', eventId: item.contentId });
        else alert(`Editing for type "${item.type}" is not yet implemented.`);
    };

    if (isLoading) {
        return <div>Loading moderation queue...</div>
    }

    return (
        <div>
            <h1 className="text-4xl font-bold text-gray-800 mb-8">Moderation Queue</h1>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flagged Item</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason / Summary</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Flagged</th>
                            <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {flaggedContent.map(item => (
                            <tr key={item.id} className="transition-colors duration-150 hover:bg-red-50/80">
                                <td className="px-6 py-4 whitespace-nowrap"><span className="font-semibold text-red-700 bg-red-100 px-2 py-1 rounded-md text-sm">{item.type}</span></td>
                                <td className="px-6 py-4 text-sm text-gray-600">{item.summary}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(item.date).toLocaleDateString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button onClick={() => handleDismiss(item.id, item.summary)} className="text-blue-600 hover:text-blue-900 font-semibold">Dismiss</button>
                                     <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-900 ml-4 font-semibold">Edit</button>
                                    <button onClick={() => handleApproveFlag(item)} className="text-red-600 hover:text-red-900 ml-4 font-semibold">Approve Flag</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {flaggedContent.length === 0 && (
                    <div className="text-center p-8 text-gray-500">
                        <h3 className="text-lg font-medium">The moderation queue is empty!</h3>
                        <p>No content has been flagged for review.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminModerationQueue;
