import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { normalizeError } from '@/domain/errors';
import type { Category } from '@/domain/diagnosis/schema';
import type {
  DiagnosisFeedback,
  DiagnosisListItemPage,
  DiagnosisRecord,
  HistoryQuery,
  MaintenanceTask,
  NewCostQuote,
  NewDiagnosisInput,
  NewMaintenanceTask,
  RepairProgress,
  UserProfile,
} from '@/domain/diagnosis/types';
import { useAuth } from '@/providers/AuthProvider';
import type {
  CreateMaintenanceInput,
  DataRepository,
  ProfileUpdate,
  SaveProgressInput,
  SubmitFeedbackInput,
  SupportMessageInput,
} from '@/services/repositories/types';

async function run<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    throw normalizeError(cause);
  }
}

function requireRepository(repository: DataRepository | null): DataRepository {
  if (!repository) {
    throw new Error('A signed-in session is required');
  }
  return repository;
}

function useSessionKey(): string {
  return useAuth().session?.user.id ?? 'anonymous';
}

export function useProfile() {
  const { repository, session } = useAuth();
  return useQuery({
    queryKey: ['profile', session?.user.id],
    queryFn: () => run(() => requireRepository(repository).getProfile()),
    enabled: Boolean(repository && session),
    staleTime: 60_000,
  });
}

export function useUpdateProfile() {
  const { repository, session } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileUpdate) =>
      run(() => requireRepository(repository).updateProfile(input)),
    onSuccess: (profile: UserProfile) => {
      queryClient.setQueryData(['profile', session?.user.id], profile);
    },
  });
}

export function useUsage() {
  const { repository, session } = useAuth();
  return useQuery({
    queryKey: ['usage', session?.user.id],
    queryFn: () => run(() => requireRepository(repository).getUsage()),
    enabled: Boolean(repository && session),
    staleTime: 30_000,
  });
}

export function useDiagnosisHistory(query: HistoryQuery) {
  const { repository, session } = useAuth();
  const filters = {
    search: query.search?.trim() ?? '',
    category: query.category ?? null,
    savedOnly: query.savedOnly ?? false,
    limit: query.limit ?? 10,
  };
  return useInfiniteQuery<DiagnosisListItemPage>({
    queryKey: ['diagnoses', session?.user.id, filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      run(() =>
        requireRepository(repository).listDiagnoses({
          ...filters,
          category: filters.category as Category | null,
          offset: Number(pageParam),
        }),
      ),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: Boolean(repository && session),
  });
}

export function useDiagnosis(diagnosisId: string | undefined) {
  const { repository, session } = useAuth();
  return useQuery({
    queryKey: ['diagnosis', diagnosisId],
    queryFn: () => run(() => requireRepository(repository).getDiagnosis(diagnosisId ?? '')),
    enabled: Boolean(repository && session && diagnosisId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'analyzing' || status === 'uploading' || status === 'draft' ? 2500 : false;
    },
  });
}

export function useCreateDiagnosis() {
  const { repository } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewDiagnosisInput) =>
      run(() => requireRepository(repository).createDiagnosis(input)),
    onSuccess: (record: DiagnosisRecord) => {
      queryClient.setQueryData(['diagnosis', record.id], record);
      void queryClient.invalidateQueries({ queryKey: ['diagnoses'] });
      void queryClient.invalidateQueries({ queryKey: ['usage'] });
    },
  });
}

export function useStartAnalysis() {
  const { repository } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (diagnosisId: string) =>
      run(() => requireRepository(repository).startAnalysis(diagnosisId)),
    onSettled: (_data, _error, diagnosisId) => {
      void queryClient.invalidateQueries({ queryKey: ['diagnosis', diagnosisId] });
      void queryClient.invalidateQueries({ queryKey: ['diagnoses'] });
      void queryClient.invalidateQueries({ queryKey: ['usage'] });
    },
  });
}

export function useReassessDiagnosis() {
  const { repository } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (diagnosisId: string) =>
      run(() => requireRepository(repository).reassessDiagnosis(diagnosisId)),
    onSettled: (_data, _error, diagnosisId) => {
      void queryClient.invalidateQueries({ queryKey: ['diagnosis', diagnosisId] });
      void queryClient.invalidateQueries({ queryKey: ['diagnoses'] });
      void queryClient.invalidateQueries({ queryKey: ['usage'] });
    },
  });
}

export function useSetSaved() {
  const { repository } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ diagnosisId, saved }: { diagnosisId: string; saved: boolean }) =>
      run(() => requireRepository(repository).setSaved(diagnosisId, saved)),
    onMutate: async ({ diagnosisId, saved }) => {
      await queryClient.cancelQueries({ queryKey: ['diagnosis', diagnosisId] });
      const previous = queryClient.getQueryData<DiagnosisRecord>(['diagnosis', diagnosisId]);
      if (previous) {
        queryClient.setQueryData(['diagnosis', diagnosisId], { ...previous, isSaved: saved });
      }
      return { previous };
    },
    onError: (_error, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['diagnosis', variables.diagnosisId], context.previous);
      }
    },
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['diagnosis', variables.diagnosisId] });
      void queryClient.invalidateQueries({ queryKey: ['diagnoses'] });
    },
  });
}

export function useDeleteDiagnosis() {
  const { repository } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (diagnosisId: string) =>
      run(() => requireRepository(repository).deleteDiagnosis(diagnosisId)),
    onSuccess: (_data, diagnosisId) => {
      queryClient.removeQueries({ queryKey: ['diagnosis', diagnosisId] });
      queryClient.removeQueries({ queryKey: ['repair-guide', diagnosisId] });
      queryClient.removeQueries({ queryKey: ['repair-progress', diagnosisId] });
      queryClient.removeQueries({ queryKey: ['feedback', diagnosisId] });
      queryClient.removeQueries({ queryKey: ['quotes', diagnosisId] });
      void queryClient.invalidateQueries({ queryKey: ['diagnoses'] });
      void queryClient.invalidateQueries({ queryKey: ['usage'] });
    },
  });
}

export function useRepairGuide(diagnosisId: string | undefined) {
  const { repository, session } = useAuth();
  return useQuery({
    queryKey: ['repair-guide', diagnosisId],
    queryFn: () => run(() => requireRepository(repository).getRepairGuide(diagnosisId ?? '')),
    enabled: Boolean(repository && session && diagnosisId),
    staleTime: 5 * 60_000,
  });
}

export function useRepairProgress(diagnosisId: string | undefined) {
  const { repository, session } = useAuth();
  return useQuery({
    queryKey: ['repair-progress', diagnosisId],
    queryFn: () => run(() => requireRepository(repository).getRepairProgress(diagnosisId ?? '')),
    enabled: Boolean(repository && session && diagnosisId),
  });
}

export function useSaveRepairProgress(diagnosisId: string) {
  const { repository } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveProgressInput) =>
      run(() => requireRepository(repository).saveRepairProgress(diagnosisId, input)),
    onSuccess: (progress: RepairProgress) => {
      queryClient.setQueryData(['repair-progress', diagnosisId], progress);
    },
  });
}

export function useFeedback(diagnosisId: string | undefined) {
  const { repository, session } = useAuth();
  return useQuery({
    queryKey: ['feedback', diagnosisId],
    queryFn: () => run(() => requireRepository(repository).getFeedback(diagnosisId ?? '')),
    enabled: Boolean(repository && session && diagnosisId),
  });
}

export function useSubmitFeedback() {
  const { repository } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitFeedbackInput) =>
      run(() => requireRepository(repository).submitFeedback(input)),
    onSuccess: (feedback: DiagnosisFeedback) => {
      queryClient.setQueryData(['feedback', feedback.diagnosisId], feedback);
    },
  });
}

export function useQuotes(diagnosisId: string | undefined) {
  const { repository, session } = useAuth();
  return useQuery({
    queryKey: ['quotes', diagnosisId],
    queryFn: () => run(() => requireRepository(repository).listQuotes(diagnosisId ?? '')),
    enabled: Boolean(repository && session && diagnosisId),
  });
}

export function useAddQuote(diagnosisId: string) {
  const { repository } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewCostQuote) => run(() => requireRepository(repository).addQuote(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quotes', diagnosisId] });
    },
  });
}

export function useDeleteQuote(diagnosisId: string) {
  const { repository } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (quoteId: string) => run(() => requireRepository(repository).deleteQuote(quoteId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quotes', diagnosisId] });
    },
  });
}

export function useMaintenance() {
  const { repository, session } = useAuth();
  return useQuery({
    queryKey: ['maintenance', session?.user.id],
    queryFn: () => run(() => requireRepository(repository).listMaintenance()),
    enabled: Boolean(repository && session),
  });
}

export function useCreateMaintenance() {
  const { repository } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewMaintenanceTask) =>
      run(() => requireRepository(repository).createMaintenance(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });
}

export function useUpdateMaintenance() {
  const { repository } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: CreateMaintenanceInput }) =>
      run(() => requireRepository(repository).updateMaintenance(taskId, input)),
    onSuccess: (task: MaintenanceTask) => {
      queryClient.setQueryData<MaintenanceTask[]>(['maintenance', task.userId], (current) =>
        current ? current.map((entry) => (entry.id === task.id ? task : entry)) : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });
}

export function useCompleteMaintenance() {
  const { repository } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      run(() => requireRepository(repository).completeMaintenance(taskId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });
}

export function useSetMaintenanceNotification() {
  const { repository } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, notificationId }: { taskId: string; notificationId: string | null }) =>
      run(() => requireRepository(repository).setMaintenanceNotificationId(taskId, notificationId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });
}

export function useDeleteMaintenance() {
  const { repository } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      run(() => requireRepository(repository).deleteMaintenance(taskId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });
}

export function useSendSupportMessage() {
  const { repository } = useAuth();
  return useMutation({
    mutationFn: (input: SupportMessageInput) =>
      run(() => requireRepository(repository).sendSupportMessage(input)),
  });
}

export function useDeleteAllData() {
  const { repository } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => run(() => requireRepository(repository).deleteAllData()),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useSessionUsageKey(): string {
  return useSessionKey();
}
