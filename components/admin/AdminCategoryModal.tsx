
import React, { useState, useEffect } from 'react';
import type { TagCategory } from '../../data/mockTags';

type AdminCategoryModalProps = {
    category: TagCategory | null;
    onClose: () => void;
    onSave: (category: TagCategory) => void;
};

const AdminCategoryModal: React.FC<AdminCategoryModalProps> = ({ category, onClose, onSave }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (category) {
            setName(category.name);
            setDescription(category.description || '');
        } else {
            setName('');
            setDescription('');
        }
    }, [category]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const categoryData = {
            id: category?.id || '',
            slug: category?.slug,
            name,
            description,
            order: category?.order || 99, // Order should be handled separately
            isActive: category?.isActive ?? true,
        };
        onSave(categoryData);
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
                        <h2 className="text-2xl font-bold text-gray-800">
                            {category ? 'Edit' : 'Add'} Tag Category
                        </h2>
                        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                    </div>
                    
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-600 mb-1">Category Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-300 rounded-md py-2 px-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                            required
                        />
                    </div>
                    
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-600 mb-1">Description (Optional)</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={3}
                            className="w-full bg-gray-50 border border-gray-300 rounded-md py-2 px-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                        />
                    </div>

                    <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
                        <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 font-semibold rounded-lg transition-colors hover:bg-gray-300 px-6 py-2">
                            Cancel
                        </button>
                        <button type="submit" className="bg-blue-600 text-white font-semibold rounded-lg transition-colors hover:bg-blue-700 shadow-sm px-6 py-2">
                            Save Category
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AdminCategoryModal;
