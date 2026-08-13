
import React, { useState, useEffect } from 'react';
import type { Tag } from '../../data/mockTags';

type AdminTagModalProps = {
    tag: Tag | null;
    categoryId: string;
    onClose: () => void;
    onSave: (tag: Tag) => void;
};

const AdminTagModal: React.FC<AdminTagModalProps> = ({ tag, categoryId, onClose, onSave }) => {
    const [label, setLabel] = useState('');
    const [description, setDescription] = useState('');
    const [aliases, setAliases] = useState('');
    const [isVisible, setIsVisible] = useState(true);
    const [isDeprecated, setIsDeprecated] = useState(false);
    const [appliesTo, setAppliesTo] = useState<NonNullable<Tag['appliesTo']>>(['club', 'event']);

    useEffect(() => {
        if (tag) {
            setLabel(tag.label);
            setDescription(tag.description || '');
            setAliases(tag.aliases?.join(', ') || '');
            setIsVisible(tag.isVisible);
            setIsDeprecated(tag.isDeprecated);
            setAppliesTo(tag.appliesTo ?? ['club', 'event']);
        } else {
            // Reset for new tag
            setLabel('');
            setDescription('');
            setAliases('');
            setIsVisible(true);
            setIsDeprecated(false);
            setAppliesTo(['club', 'event']);
        }
    }, [tag]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!appliesTo.length) return;
        const tagData: Tag = {
            id: tag?.id || '',
            categoryId,
            slug: tag?.slug,
            value: tag?.value,
            label,
            description,
            aliases: aliases.split(',').map(a => a.trim()).filter(Boolean),
            appliesTo,
            sortOrder: tag?.sortOrder ?? 100,
            isVisible,
            isDeprecated,
            usageCount: tag?.usageCount || 0,
        };
        onSave(tagData);
    };

    return (
        <div 
            className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6"
                onClick={e => e.stopPropagation()}
            >
                <form onSubmit={handleSubmit}>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-bold text-gray-800">{tag ? 'Edit' : 'Add'} Tag</h2>
                        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Tag Label</label>
                            <input
                                type="text"
                                value={label}
                                onChange={e => setLabel(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-300 rounded-md py-2 px-3 text-gray-900 focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Aliases (comma-separated)</label>
                            <input
                                type="text"
                                value={aliases}
                                onChange={e => setAliases(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-300 rounded-md py-2 px-3 text-gray-900 focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Description (Optional)</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={3}
                                className="w-full bg-gray-50 border border-gray-300 rounded-md py-2 px-3 text-gray-900 focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-2">Applies To</label>
                            <div className="flex flex-wrap gap-3">
                                {([
                                    ['club', 'Clubs'],
                                    ['event', 'Events'],
                                    ['resort', 'Resorts'],
                                    ['cruise_series', 'Cruise Series'],
                                    ['cruise_sailing', 'Cruise Sailings'],
                                ] as const).map(([scope, label]) => (
                                    <label key={scope} className="flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={appliesTo.includes(scope)}
                                            onChange={() => setAppliesTo((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope])}
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        {label}
                                    </label>
                                ))}
                            </div>
                            {!appliesTo.length ? <p className="mt-1 text-xs text-red-600">Choose at least one entity type.</p> : null}
                        </div>
                        <div className="flex space-x-6">
                             <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isVisible}
                                    onChange={e => setIsVisible(e.target.checked)}
                                    className="h-4 w-4 rounded bg-gray-200 border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">Visible</span>
                            </label>
                             <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isDeprecated}
                                    onChange={e => setIsDeprecated(e.target.checked)}
                                    className="h-4 w-4 rounded bg-gray-200 border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">Deprecated</span>
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 mt-8 pt-4 border-t border-gray-200">
                        <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 px-6 py-2">
                            Cancel
                        </button>
                        <button type="submit" disabled={!appliesTo.length} className="bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 shadow-sm px-6 py-2 disabled:cursor-not-allowed disabled:opacity-50">
                            Save Tag
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AdminTagModal;
