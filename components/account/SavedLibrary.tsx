import React, { useEffect, useMemo, useState } from 'react';
import { Bookmark, ExternalLink, FolderPlus, LockKeyhole, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { User } from '../../data/mockUsers';
import { useMemberHubDemoContent } from '../../hooks/useMemberHubDemoContent';
import * as api from '../../lib/api';
import {
  addSavedEntityToCollection,
  createSavedCollection,
  deleteSavedCollection,
  listSavedCollectionItems,
  listSavedCollections,
  listSavedEntities,
  removeSavedEntity,
  removeSavedEntityFromCollection,
} from '../../lib/profile/profileService';
import type { SavedCollection, SavedCollectionItem, SavedEntity } from '../../lib/profile/profileTypes';
import type { Listing } from '../../types';
import { useAppStore } from '../../store/appStore';
import Button from '../Button';

const SavedLibrary: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const { addToast } = useAppStore();
  const demo = useMemberHubDemoContent(currentUser);
  const [saved, setSaved] = useState<SavedEntity[]>([]);
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const [collectionItems, setCollectionItems] = useState<SavedCollectionItem[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [collectionTitle, setCollectionTitle] = useState('');

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      setListings(await api.getListings());
    } catch {
      setListings([]);
    }

    try {
      const [savedRows, collectionRows, collectionItemRows] = await Promise.all([
        listSavedEntities(currentUser.id),
        listSavedCollections(currentUser.id),
        listSavedCollectionItems(),
      ]);
      setSaved(savedRows);
      setCollections(collectionRows);
      setCollectionItems(collectionItemRows);
    } catch (loadError) {
      setSaved([]);
      setCollections([]);
      setCollectionItems([]);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your saved library.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [currentUser.id]);

  const listingById = useMemo(() => new Map(listings.map((listing) => [listing.id, listing])), [listings]);
  const displaySaved = useMemo<SavedEntity[]>(() => {
    const demoRows: SavedEntity[] = demo.savedDiscoveries.map((item) => ({
      id: item.id,
      userId: currentUser.id,
      entityType: item.entityType,
      entityId: item.entityId,
      createdAt: item.createdAt,
      updatedAt: item.createdAt,
    }));
    const demoKeys = new Set(demoRows.map((item) => `${item.entityType}:${item.entityId}`));
    return [
      ...demoRows,
      ...saved.filter((item) => !demoKeys.has(`${item.entityType}:${item.entityId}`)),
    ];
  }, [currentUser.id, demo.savedDiscoveries, saved]);

  const createCollection = async (event: React.FormEvent) => {
    event.preventDefault();
    const title = collectionTitle.trim();
    if (!title) return;
    try {
      const created = await createSavedCollection(currentUser.id, { title });
      setCollections((current) => [created, ...current]);
      setCollectionTitle('');
      setIsCreatingCollection(false);
      addToast({ message: 'Private collection created.', type: 'success' });
    } catch (createError) {
      addToast({ message: createError instanceof Error ? createError.message : 'Unable to create collection.', type: 'error' });
    }
  };

  const removeSaved = async (item: SavedEntity) => {
    if (item.id.startsWith('demo-saved-')) {
      demo.deleteSavedDiscovery(item.id);
      addToast({ message: 'Removed temporary saved discovery.', type: 'success' });
      return;
    }

    try {
      await removeSavedEntity(currentUser.id, item.id);
      setSaved((current) => current.filter((savedItem) => savedItem.id !== item.id));
      setCollectionItems((current) => current.filter((collectionItem) => collectionItem.savedEntityId !== item.id));
      addToast({ message: 'Removed from saved.', type: 'success' });
    } catch (removeError) {
      addToast({ message: removeError instanceof Error ? removeError.message : 'Unable to remove saved item.', type: 'error' });
    }
  };

  const removeCollection = async (collection: SavedCollection) => {
    if (!window.confirm(`Delete the private collection “${collection.title}”? Saved items themselves will remain in your library.`)) return;
    try {
      await deleteSavedCollection(currentUser.id, collection.id);
      setCollections((current) => current.filter((item) => item.id !== collection.id));
      setCollectionItems((current) => current.filter((item) => item.collectionId !== collection.id));
      addToast({ message: 'Collection deleted.', type: 'success' });
    } catch (removeError) {
      addToast({ message: removeError instanceof Error ? removeError.message : 'Unable to delete collection.', type: 'error' });
    }
  };

  const addToCollection = async (savedEntityId: string, collectionId: string) => {
    if (!collectionId || collectionItems.some((item) => item.savedEntityId === savedEntityId && item.collectionId === collectionId)) return;
    try {
      const created = await addSavedEntityToCollection(collectionId, savedEntityId);
      setCollectionItems((current) => [created, ...current]);
      addToast({ message: 'Added to private collection.', type: 'success' });
    } catch (collectionError) {
      addToast({ message: collectionError instanceof Error ? collectionError.message : 'Unable to update collection.', type: 'error' });
    }
  };

  const removeFromCollection = async (savedEntityId: string, collectionId: string) => {
    try {
      await removeSavedEntityFromCollection(collectionId, savedEntityId);
      setCollectionItems((current) => current.filter((item) => item.savedEntityId !== savedEntityId || item.collectionId !== collectionId));
      addToast({ message: 'Removed from collection.', type: 'success' });
    } catch (collectionError) {
      addToast({ message: collectionError instanceof Error ? collectionError.message : 'Unable to update collection.', type: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <section className="ss-glass-surface rounded-[26px] p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">Private library</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Saved discoveries</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">Clubs, events, organizers, resorts, and cruises you save appear here. Nothing in this library is added to your public member profile.</p>
          </div>
          <span className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-xl border border-white/10 bg-white/[0.035] px-3.5 text-sm font-semibold text-gray-300"><LockKeyhole size={16} aria-hidden="true" /> Only you</span>
        </div>
      </section>

      {demo.isEligible ? (
        <section className="rounded-[22px] border border-fuchsia-300/15 bg-fuchsia-500/[0.055] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-200/80">Temporary saved examples</p>
              <p className="mt-1 text-sm leading-6 text-gray-400">
                {demo.isEnabled
                  ? 'Winter Masquerade, Twist SF, and Connect.Dance.Love are populated here as browser-only examples for the SwingSphere admin profile.'
                  : 'The temporary saved examples have been removed from this browser.'}
              </p>
            </div>
            {demo.isEnabled ? (
              <button type="button" onClick={demo.removeAll} className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl border border-white/10 px-3 text-xs font-bold text-gray-300 transition hover:border-red-400/30 hover:text-red-200"><Trash2 size={14} /> Remove demo data</button>
            ) : (
              <button type="button" onClick={demo.reset} className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl border border-fuchsia-300/25 bg-fuchsia-500/10 px-3 text-xs font-bold text-fuchsia-100"><FolderPlus size={14} /> Restore demo data</button>
            )}
          </div>
        </section>
      ) : null}

      <section className="ss-glass-surface rounded-[26px] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Collections</p>
            <h3 className="mt-1 text-xl font-bold text-white">Organize your shortlist</h3>
          </div>
          <Button variant="secondary" onClick={() => setIsCreatingCollection((current) => !current)}>
            <span className="inline-flex items-center gap-2"><FolderPlus size={16} aria-hidden="true" /> New collection</span>
          </Button>
        </div>

        {isCreatingCollection ? (
          <form onSubmit={createCollection} className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-black/25 p-4 sm:flex-row">
            <label className="sr-only" htmlFor="new-saved-collection">Collection title</label>
            <input
              id="new-saved-collection"
              autoFocus
              value={collectionTitle}
              onChange={(event) => setCollectionTitle(event.target.value)}
              maxLength={80}
              placeholder="Santa Cruz weekend"
              className="min-h-11 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-gray-600 focus:border-red-400/55"
            />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => { setIsCreatingCollection(false); setCollectionTitle(''); }}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={!collectionTitle.trim()}>Create</Button>
            </div>
          </form>
        ) : null}

        {collections.length ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {collections.map((collection) => (
              <div key={collection.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{collection.title}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500"><LockKeyhole size={12} aria-hidden="true" /> Private collection</p>
                </div>
                <button type="button" onClick={() => void removeCollection(collection)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-500 transition hover:bg-red-500/10 hover:text-red-200" aria-label={`Delete ${collection.title}`}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        ) : !isLoading ? <p className="mt-5 text-sm text-gray-500">No collections yet. Your general Saved library works without creating one.</p> : null}
      </section>

      <section className="ss-glass-surface rounded-[26px] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">All saved</p>
            <h3 className="mt-1 text-xl font-bold text-white">Your private shortlist</h3>
          </div>
          {!isLoading ? <span className="text-sm font-semibold text-gray-500">{displaySaved.length}</span> : null}
        </div>

        {isLoading ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]" />)}
          </div>
        ) : displaySaved.length ? (
          <>
            {error ? <p className="mt-5 rounded-xl border border-amber-300/15 bg-amber-500/[0.06] px-4 py-3 text-xs leading-5 text-amber-100/75">Live saved data could not load, so temporary examples are shown. {error}</p> : null}
            <div className="mt-5 grid gap-3 md:grid-cols-2">
            {displaySaved.map((item) => {
              const listing = listingById.get(item.entityId);
              const name = listing?.name ?? `${item.entityType.replace(/_/g, ' ')} ${item.entityId}`;
              const location = listing?.location;
              const imageUrl = listing?.headerImageUrl || listing?.logoImageUrl;
              const href = item.entityType === 'club' || item.entityType === 'event'
                ? `/listing/${item.entityId}`
                : undefined;
              const isDemoItem = item.id.startsWith('demo-saved-');
              const assignedCollections = isDemoItem ? [] : collectionItems
                .filter((collectionItem) => collectionItem.savedEntityId === item.id)
                .map((collectionItem) => collections.find((collection) => collection.id === collectionItem.collectionId))
                .filter((collection): collection is SavedCollection => Boolean(collection));
              const availableCollections = isDemoItem
                ? []
                : collections.filter((collection) => !assignedCollections.some((assigned) => assigned.id === collection.id));
              return (
                <article key={item.id} className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-black/20">
                  <div className="flex min-h-32">
                    <div className="flex w-28 shrink-0 items-center justify-center overflow-hidden border-r border-white/[0.07] bg-black/30 text-gray-600">
                      {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <Bookmark size={24} aria-hidden="true" />}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col p-4">
                      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-red-200/70">
                        {item.entityType.replace(/_/g, ' ')}
                        {isDemoItem ? <span className="rounded-full border border-fuchsia-300/15 bg-fuchsia-500/[0.07] px-2 py-0.5 tracking-normal text-fuchsia-200/70">Demo</span> : null}
                      </p>
                      <h4 className="mt-1 truncate text-base font-bold text-white">{name}</h4>
                      {location ? <p className="mt-1 truncate text-xs text-gray-500">{location}</p> : null}
                      {assignedCollections.length ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {assignedCollections.map((collection) => (
                            <button
                              key={collection.id}
                              type="button"
                              onClick={() => void removeFromCollection(item.id, collection.id)}
                              title={`Remove from ${collection.title}`}
                              className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] font-semibold text-gray-400 transition hover:border-red-400/25 hover:text-red-200"
                            >
                              {collection.title} ×
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {availableCollections.length ? (
                        <select
                          aria-label={`Add ${name} to a collection`}
                          value=""
                          onChange={(event) => void addToCollection(item.id, event.target.value)}
                          className="mt-3 min-h-10 w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 text-xs text-gray-300 outline-none focus:border-red-400/45"
                        >
                          <option value="">Add to collection…</option>
                          {availableCollections.map((collection) => <option key={collection.id} value={collection.id}>{collection.title}</option>)}
                        </select>
                      ) : null}
                      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                        {href ? <Link to={href} className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-red-300 transition hover:text-red-200">Open <ExternalLink size={14} aria-hidden="true" /></Link> : <span className="text-xs text-gray-600">Detail link pending</span>}
                        <button type="button" onClick={() => void removeSaved(item)} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-gray-500 transition hover:bg-red-500/10 hover:text-red-200"><Trash2 size={14} aria-hidden="true" /> Remove</button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
            </div>
          </>
        ) : error ? (
          <div role="alert" className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 p-5 text-sm text-red-200">
            <p className="font-bold">Saved library could not load</p>
            <p className="mt-1 text-red-200/75">{error}</p>
            <button type="button" onClick={() => void load()} className="mt-4 font-bold text-white">Try again</button>
          </div>
        ) : (
          <div className="mt-5 rounded-[22px] border border-dashed border-white/[0.12] bg-black/20 px-6 py-12 text-center">
            <Bookmark className="mx-auto text-gray-600" size={34} aria-hidden="true" />
            <h4 className="mt-4 text-xl font-bold text-white">Build your private shortlist</h4>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">Save a club or event while exploring and it will appear here without being shown on your profile.</p>
            <Link to="/globe" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-500">Explore the globe</Link>
          </div>
        )}
      </section>
    </div>
  );
};

export default SavedLibrary;
