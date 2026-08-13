import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from 'react';
import { DEFAULT_EXPLORER_CAMERA, type ExplorerCameraPose, type ExplorerSurfaceMode } from '../../lib/explorerCamera';

export type ExplorerListingType = 'club' | 'event' | 'promoter';

type ExplorerState = {
  selectedListingId: string | null;
  searchText: string;
  selectedTags: string[];
  listingTypes: ExplorerListingType[];
  surfaceMode: ExplorerSurfaceMode;
  camera: ExplorerCameraPose;
};

type ExplorerAction =
  | { type: 'set-selected-listing'; listingId: string | null }
  | { type: 'set-search-text'; searchText: string }
  | { type: 'set-selected-tags'; selectedTags: string[] }
  | { type: 'set-listing-types'; listingTypes: ExplorerListingType[] }
  | { type: 'set-surface-mode'; surfaceMode: ExplorerSurfaceMode }
  | { type: 'set-camera'; camera: Partial<ExplorerCameraPose> }
  | { type: 'set-camera-pose'; camera: ExplorerCameraPose };

type ExplorerContextValue = ExplorerState & {
  setSelectedListingId: (listingId: string | null) => void;
  setSearchText: (searchText: string) => void;
  setSelectedTags: (selectedTags: string[]) => void;
  setListingTypes: (listingTypes: ExplorerListingType[]) => void;
  setSurfaceMode: (surfaceMode: ExplorerSurfaceMode) => void;
  setCamera: (camera: Partial<ExplorerCameraPose>) => void;
  setCameraPose: (camera: ExplorerCameraPose) => void;
};

const INITIAL_EXPLORER_STATE: ExplorerState = {
  selectedListingId: null,
  searchText: '',
  selectedTags: [],
  listingTypes: [],
  surfaceMode: DEFAULT_EXPLORER_CAMERA.surface,
  camera: DEFAULT_EXPLORER_CAMERA,
};

const ExplorerContext = createContext<ExplorerContextValue | null>(null);

const explorerReducer = (state: ExplorerState, action: ExplorerAction): ExplorerState => {
  switch (action.type) {
    case 'set-selected-listing':
      return state.selectedListingId === action.listingId
        ? state
        : { ...state, selectedListingId: action.listingId };
    case 'set-search-text':
      return state.searchText === action.searchText
        ? state
        : { ...state, searchText: action.searchText };
    case 'set-selected-tags':
      return { ...state, selectedTags: [...action.selectedTags] };
    case 'set-listing-types':
      return { ...state, listingTypes: [...action.listingTypes] };
    case 'set-surface-mode':
      return state.surfaceMode === action.surfaceMode
        ? state
        : { ...state, surfaceMode: action.surfaceMode };
    case 'set-camera':
      return {
        ...state,
        camera: {
          ...state.camera,
          ...action.camera,
          surface: action.camera.surface ?? state.camera.surface,
        },
      };
    case 'set-camera-pose':
      return { ...state, camera: action.camera };
    default:
      return state;
  }
};

export const ExplorerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(explorerReducer, INITIAL_EXPLORER_STATE);

  const setSelectedListingId = useCallback((listingId: string | null) => {
    dispatch({ type: 'set-selected-listing', listingId });
  }, []);

  const setSearchText = useCallback((searchText: string) => {
    dispatch({ type: 'set-search-text', searchText });
  }, []);

  const setSelectedTags = useCallback((selectedTags: string[]) => {
    dispatch({ type: 'set-selected-tags', selectedTags });
  }, []);

  const setListingTypes = useCallback((listingTypes: ExplorerListingType[]) => {
    dispatch({ type: 'set-listing-types', listingTypes });
  }, []);

  const setSurfaceMode = useCallback((surfaceMode: ExplorerSurfaceMode) => {
    dispatch({ type: 'set-surface-mode', surfaceMode });
  }, []);

  const setCamera = useCallback((camera: Partial<ExplorerCameraPose>) => {
    dispatch({ type: 'set-camera', camera });
  }, []);

  const setCameraPose = useCallback((camera: ExplorerCameraPose) => {
    dispatch({ type: 'set-camera-pose', camera });
  }, []);

  const value = useMemo<ExplorerContextValue>(() => ({
    ...state,
    setSelectedListingId,
    setSearchText,
    setSelectedTags,
    setListingTypes,
    setSurfaceMode,
    setCamera,
    setCameraPose,
  }), [
    state,
    setCamera,
    setCameraPose,
    setListingTypes,
    setSearchText,
    setSelectedListingId,
    setSelectedTags,
    setSurfaceMode,
  ]);

  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
};

export const useExplorerContext = (): ExplorerContextValue => {
  const context = useContext(ExplorerContext);
  if (!context) {
    throw new Error('useExplorerContext must be used within ExplorerProvider');
  }
  return context;
};
