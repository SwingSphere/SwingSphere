
import React from 'react';
import type { User } from '../../data/mockUsers';

const StatCard: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
    <div className="bg-white p-4 rounded-lg border border-gray-200 text-center">
        <p className="text-2xl font-bold text-blue-600">{value}</p>
        <p className="text-sm font-medium text-gray-500">{label}</p>
    </div>
);

const AdminUserDetails: React.FC<{ user: User }> = ({ user }) => {
    // Mock data for demonstration
    const mockActivity = [
        { id: 1, action: "Posted review for 'The Velvet Chamber'", date: '2024-05-10' },
        { id: 2, action: "RSVP'd to 'Midnight Masquerade'", date: '2024-05-08' },
        { id: 3, action: "Submitted new club: 'The Kink Dungeon'", date: '2024-04-22' },
        { id: 4, action: "Voted on 'Neon Nights Pool Party'", date: '2024-04-15' },
    ];
    
    return (
        <div className="p-6 bg-blue-50/50">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                <div className="lg:col-span-2">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Column 1: Stats & Badges */}
                        <div className="md:col-span-1 space-y-6">
                             <div>
                                 <h4 className="text-lg font-semibold text-gray-700 mb-4">User Stats</h4>
                                 <div className="space-y-4">
                                    <StatCard label="Clubs Submitted" value={user.role === 'Host' ? user.submissionCount : 0} />
                                    <StatCard label="Events Attended" value={12} />
                                    <StatCard label="Reviews Left" value={8} />
                                </div>
                             </div>
                             <div>
                                <h4 className="text-lg font-semibold text-gray-700 mb-4">Badges</h4>
                                <div className="space-y-2">
                                    {user.badges && user.badges.length > 0 ? (
                                        user.badges.map(badge => (
                                            <span key={badge} className="inline-block bg-yellow-100 text-yellow-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full">
                                                {badge}
                                            </span>
                                        ))
                                    ) : (
                                        <p className="text-sm text-gray-500">No badges assigned.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Column 2: Recent Activity */}
                        <div className="md:col-span-2">
                            <h4 className="text-lg font-semibold text-gray-700 mb-4">Recent Activity</h4>
                            <ul className="space-y-3 bg-white p-4 rounded-lg border border-gray-200 max-h-64 overflow-y-auto">
                                {mockActivity.slice(0, 4).map(item => (
                                    <li key={item.id} className="text-sm text-gray-600 border-b border-gray-100 pb-2 last:border-b-0">
                                        <p className="font-medium text-gray-800">{item.action}</p>
                                        <p className="text-xs text-gray-500">{item.date}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
                
                {/* Column 3: Internal Notes */}
                <div className="lg:col-span-1">
                     <h4 className="text-lg font-semibold text-gray-700 mb-4">Internal Admin Notes</h4>
                     <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <textarea
                            placeholder={`Add notes for ${user.displayName}... (e.g., "Verified host via phone call")`}
                            rows={8}
                            className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                        ></textarea>
                         <button 
                            onClick={() => alert('Note saving is not implemented.')}
                            className="mt-2 w-full bg-blue-600 text-white font-semibold text-sm rounded-md py-2 transition-colors hover:bg-blue-700"
                        >
                            Save Note
                        </button>
                     </div>
                </div>
            </div>
        </div>
    );
};

export default AdminUserDetails;