import React, { useState, useMemo, useEffect } from 'react';
import type { Tag, TagCategory } from '../../data/mockTags';
import AdminCategoryModal from './AdminCategoryModal';
import AdminTagModal from './AdminTagModal';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/appStore';

const AddIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>;
const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${className || ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
const DragIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 cursor-grab" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>;
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;
const DeleteIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;

const AdminTagsAndFilters: React.FC = () => {
    const [categories, setCategories] = useState<TagCategory[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
    const [showLegacyTags, setShowLegacyTags] = useState(false);
    const { addToast } = useAppStore();

    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [isTagModalOpen, setIsTagModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<TagCategory | null>(null);
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
    
    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [cats, tagsData] = await Promise.all([api.getAdminTagCategories(), api.getAdminTags()]);
            setCategories(cats);
            setTags(tagsData);
        } catch (e) {
            addToast({ message: 'Failed to load tags data.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        fetchData();
    }, []);

    const stats = useMemo(() => {
        if (tags.length === 0) return { hiddenCount: 0, deprecatedCount: 0 };
        const sortedByUsage = [...tags].sort((a, b) => b.usageCount - a.usageCount);
        return {
            mostUsed: sortedByUsage[0], leastUsed: sortedByUsage[sortedByUsage.length - 1],
            hiddenCount: tags.filter(t => !t.isVisible).length, deprecatedCount: tags.filter(t => t.isDeprecated).length,
        };
    }, [tags]);

    const handleToggleCategory = (catId: string) => setOpenCategories(prev => ({ ...prev, [catId]: !prev[catId] }));
    const handleAddCategory = () => { setEditingCategory(null); setIsCategoryModalOpen(true); };
    const handleEditCategory = (category: TagCategory) => { setEditingCategory(category); setIsCategoryModalOpen(true); };
    const handleAddTag = (catId: string) => { setEditingTag(null); setActiveCategoryId(catId); setIsTagModalOpen(true); };
    const handleEditTag = (tag: Tag) => { setEditingTag(tag); setActiveCategoryId(tag.categoryId); setIsTagModalOpen(true); };

    const handleSaveCategory = async (categoryData: Omit<TagCategory, 'id' | 'order'> & { id?: string }) => {
        try {
            await api.saveCategory(categoryData);
            addToast({ message: `Category ${editingCategory ? 'updated' : 'created'}.`, type: 'success'});
            fetchData();
        } catch (e) { addToast({ message: 'Failed to save category.', type: 'error'}); }
        setIsCategoryModalOpen(false); setEditingCategory(null);
    };

    const handleDeleteTag = async (tagId: string) => {
        const tag = tags.find((item) => item.id === tagId);
        if (!tag) return;
        const reason = window.prompt(`Deprecate “${tag.label}”? Existing listings will keep resolving this value.\n\nReason:`);
        if (!reason?.trim()) return;
        try {
            await api.deprecateTag(tagId, reason.trim());
            addToast({ message: 'Tag deprecated and hidden from new selections.', type: 'success'});
            fetchData();
        } catch (e) { addToast({ message: 'Failed to deprecate tag.', type: 'error'}); }
    };
    
    const handleSaveTag = async (tagData: Omit<Tag, 'id' | 'usageCount' | 'categoryId'> & { id?: string }) => {
        try {
            await api.saveTag({ ...tagData, categoryId: activeCategoryId! });
            addToast({ message: `Tag ${editingTag ? 'updated' : 'created'}.`, type: 'success'});
            fetchData();
        } catch (e) { addToast({ message: 'Failed to save tag.', type: 'error'}); }
        setIsTagModalOpen(false); setEditingTag(null); setActiveCategoryId(null);
    };
    
    if (isLoading) return <div>Loading Tags & Filters...</div>;

    return (
        <div>
            {isCategoryModalOpen && <AdminCategoryModal category={editingCategory} onClose={() => setIsCategoryModalOpen(false)} onSave={handleSaveCategory}/>}
            {isTagModalOpen && activeCategoryId && <AdminTagModal tag={editingTag} categoryId={activeCategoryId} onClose={() => setIsTagModalOpen(false)} onSave={handleSaveTag}/>}

            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Tags & Filters</h1>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">Active taxonomy stays focused on discovery. Historical values remain available for compatibility, but are hidden by default.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => setShowLegacyTags((value) => !value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
                        {showLegacyTags ? 'Hide' : 'Show'} legacy / hidden ({stats.hiddenCount})
                    </button>
                    <button onClick={handleAddCategory} className="flex items-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"><AddIcon /> Add category</button>
                </div>
            </div>

            <div className="space-y-4">
                {categories.sort((a,b) => a.order - b.order).map(cat => {
                    const allCategoryTags = tags.filter(t => t.categoryId === cat.id);
                    const activeCategoryTags = allCategoryTags.filter(t => t.isVisible && !t.isDeprecated);
                    const legacyCategoryTags = allCategoryTags.filter(t => !t.isVisible || t.isDeprecated);
                    const categoryTags = showLegacyTags ? allCategoryTags : activeCategoryTags;
                    const isStructuredAudienceCategory = cat.slug === 'audience-access' || cat.id === 'cat-audience';
                    return (
                        <div key={cat.id} className="bg-white rounded-lg shadow-sm border border-gray-200">
                            <div className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50" onClick={() => handleToggleCategory(cat.id)}>
                                <div className="flex min-w-0 items-center gap-3"><DragIcon /><h2 className="truncate text-base font-bold text-gray-800">{cat.name}</h2><span className="whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{activeCategoryTags.length} active</span>{legacyCategoryTags.length > 0 && <span className="whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{legacyCategoryTags.length} legacy</span>}</div>
                                <div className="flex items-center gap-4">
                                    <button onClick={(e) => { e.stopPropagation(); handleAddTag(cat.id); }} className="bg-blue-50 text-blue-700 font-semibold rounded-lg hover:bg-blue-100 px-3 py-1.5 text-xs flex items-center"><AddIcon /> Add Tag</button>
                                    <ChevronDownIcon className={`${openCategories[cat.id] ? 'rotate-180' : ''}`} />
                                </div>
                            </div>
                            {openCategories[cat.id] && (
                                <div className="border-t border-gray-200">
                                    {isStructuredAudienceCategory && (
                                        <div className="border-b border-gray-200 bg-blue-50/60 px-4 py-3 text-xs leading-5 text-blue-800">
                                            Audience and access are now modeled with structured attendance policies and entry requirements. Legacy tags remain here only so older listings continue to resolve correctly.
                                        </div>
                                    )}
                                    {categoryTags.length > 0 ? (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50"><tr><th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 w-1/3">Label</th><th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Usage</th><th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Applies to</th><th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Status</th><th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Actions</th></tr></thead>
                                                <tbody className="divide-y divide-gray-100 bg-white">
                                                    {categoryTags.map(tag => (
                                                        <tr key={tag.id} className={!tag.isVisible || tag.isDeprecated ? 'bg-gray-50/60' : undefined}>
                                                            <td className="px-4 py-3 text-xs font-semibold text-gray-900">{tag.label}</td>
                                                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{tag.usageCount}</td>
                                                            <td className="px-4 py-3 text-xs text-gray-500">{(tag.appliesTo ?? ['club', 'event']).join(', ')}</td>
                                                            <td className="px-4 py-3 text-xs">{tag.isDeprecated ? <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700">Legacy</span> : tag.isVisible ? <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">Active</span> : <span className="rounded-full bg-gray-100 px-2 py-1 font-semibold text-gray-600">Hidden</span>}</td>
                                                            <td className="px-4 py-3 whitespace-nowrap text-xs font-medium"><div className="flex items-center gap-3"><button title="Edit tag" onClick={() => handleEditTag(tag)} className="text-blue-600 hover:text-blue-800"><EditIcon /></button><button title="Deprecate tag" disabled={tag.isDeprecated} onClick={() => handleDeleteTag(tag.id)} className="text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:text-gray-300"><DeleteIcon /></button></div></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="px-4 py-4 text-xs text-gray-500">{showLegacyTags ? 'No tags in this category.' : 'No active tags in this category.'}</div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="mt-10 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">Tag Stats Summary</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                    <li><strong>Most Used:</strong> “{stats.mostUsed?.label}” ({stats.mostUsed?.usageCount} times)</li>
                    <li><strong>Least Used:</strong> “{stats.leastUsed?.label}” ({stats.leastUsed?.usageCount} times)</li>
                    <li><strong>Hidden Tags:</strong> {stats.hiddenCount}</li>
                    <li><strong>Deprecated Tags:</strong> {stats.deprecatedCount}</li>
                </ul>
            </div>
        </div>
    );
};

export default AdminTagsAndFilters;
