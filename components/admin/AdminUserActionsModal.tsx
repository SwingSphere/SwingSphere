
import React, { useState, useEffect } from 'react';
import type { User } from '../../data/mockUsers';

type AdminUserActionsModalProps = {
    user: User;
    onClose: () => void;
    onSave: (updatedUser: User) => void;
};

const ALL_BADGES = ['Star User']; // Add more potential badges here

const AdminUserActionsModal: React.FC<AdminUserActionsModalProps> = ({ user, onClose, onSave }) => {
    const [currentRole, setCurrentRole] = useState(user.role);
    const [currentBadges, setCurrentBadges] = useState<string[]>(user.badges || []);

    const handleBadgeToggle = (badge: string) => {
        setCurrentBadges(prev => 
            prev.includes(badge) ? prev.filter(b => b !== badge) : [...prev, badge]
        );
    };

    const handleSave = () => {
        const updatedUser: User = {
            ...user,
            role: currentRole,
            badges: currentBadges,
        };
        onSave(updatedUser);
    };
    
    // Handle Escape key press
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    return (
        <div 
            className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-gray-800">Manage: {user.displayName}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
                </div>
                
                {/* Role Management */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-600 mb-1">User Role</label>
                    <select
                        value={currentRole}
                        onChange={e => setCurrentRole(e.target.value as User['role'])}
                        className="w-full bg-gray-50 border border-gray-300 rounded-md py-2 px-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                    >
                        <option value="User">User</option>
                        <option value="Host">Host</option>
                        <option value="Admin">Admin</option>
                    </select>
                </div>
                
                {/* Badge Management */}
                <div>
                     <h4 className="text-md font-semibold text-gray-700 mb-2">Assign Badges</h4>
                     <div className="space-y-2">
                        {ALL_BADGES.map(badge => (
                            <label key={badge} className="flex items-center space-x-2 p-2 rounded-md cursor-pointer hover:bg-gray-100 transition">
                                <input
                                    type="checkbox"
                                    checked={currentBadges.includes(badge)}
                                    onChange={() => handleBadgeToggle(badge)}
                                    className="h-4 w-4 rounded bg-gray-200 border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">{badge}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end gap-4 mt-8 pt-4 border-t border-gray-200">
                    <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 font-semibold rounded-lg transition-colors hover:bg-gray-300 px-6 py-2">
                        Cancel
                    </button>
                    <button type="button" onClick={handleSave} className="bg-blue-600 text-white font-semibold rounded-lg transition-colors hover:bg-blue-700 shadow-sm px-6 py-2">
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdminUserActionsModal;