import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Category } from '@/domain/diagnosis/schema';

export type DraftPhoto = {
  uri: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
};

type DiagnosisDraftState = {
  category: Category;
  description: string;
  brand: string;
  model: string;
  errorCode: string;
  ageYears: string;
  photos: DraftPhoto[];
  setCategory: (category: Category) => void;
  setDescription: (description: string) => void;
  setBrand: (brand: string) => void;
  setModel: (model: string) => void;
  setErrorCode: (errorCode: string) => void;
  setAgeYears: (ageYears: string) => void;
  addPhoto: (photo: DraftPhoto) => void;
  removePhoto: (uri: string) => void;
  reset: () => void;
};

const initial = {
  category: 'appliance' as Category,
  description: '',
  brand: '',
  model: '',
  errorCode: '',
  ageYears: '',
  photos: [] as DraftPhoto[],
};

export const useDiagnosisDraft = create<DiagnosisDraftState>()(
  persist(
    (set) => ({
      ...initial,
      setCategory: (category) => set({ category }),
      setDescription: (description) => set({ description }),
      setBrand: (brand) => set({ brand }),
      setModel: (model) => set({ model }),
      setErrorCode: (errorCode) => set({ errorCode }),
      setAgeYears: (ageYears) => set({ ageYears }),
      addPhoto: (photo) =>
        set((state) => ({
          photos: state.photos.some((entry) => entry.uri === photo.uri)
            ? state.photos
            : [...state.photos, photo],
        })),
      removePhoto: (uri) =>
        set((state) => ({ photos: state.photos.filter((photo) => photo.uri !== uri) })),
      reset: () => set({ ...initial }),
    }),
    {
      name: 'snapfix.diagnosis-draft.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        category: state.category,
        description: state.description,
        brand: state.brand,
        model: state.model,
        errorCode: state.errorCode,
        ageYears: state.ageYears,
        photos: state.photos,
      }),
    },
  ),
);
