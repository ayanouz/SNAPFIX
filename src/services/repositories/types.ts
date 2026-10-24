import type {
  CostQuote,
  DiagnosisFeedback,
  DiagnosisListItemPage,
  DiagnosisRecord,
  FeedbackReason,
  HistoryQuery,
  MaintenanceTask,
  NewCostQuote,
  NewDiagnosisInput,
  NewMaintenanceTask,
  RepairGuide,
  RepairProgress,
  SupportMessage,
  UsageSummary,
  UserProfile,
} from '@/domain/diagnosis/types';

export type CreateMaintenanceInput = NewMaintenanceTask;

export type SaveProgressInput = {
  completedStepIds: string[];
  currentStep: number;
  completedAt: string | null;
};

export type SubmitFeedbackInput = {
  diagnosisId: string;
  rating: number;
  reason: FeedbackReason | null;
  comment: string | null;
};

export type ExportBundle = {
  exportedAt: string;
  app: 'SNAPFIX';
  schemaVersion: 1;
  diagnoses: DiagnosisRecord[];
  maintenance: MaintenanceTask[];
  feedback: DiagnosisFeedback[];
  quotes: CostQuote[];
  progress: RepairProgress[];
};

export type SupportMessageInput = Omit<SupportMessage, 'id' | 'createdAt'>;

export type ProfileUpdate = Partial<
  Pick<UserProfile, 'displayName' | 'preferredLanguage' | 'preferredCurrency' | 'theme'>
>;

export interface DataRepository {
  readonly mode: 'demo' | 'live';
  getProfile(): Promise<UserProfile>;
  updateProfile(input: ProfileUpdate): Promise<UserProfile>;
  createDiagnosis(input: NewDiagnosisInput): Promise<DiagnosisRecord>;
  startAnalysis(diagnosisId: string): Promise<void>;
  reassessDiagnosis(diagnosisId: string): Promise<void>;
  getDiagnosis(diagnosisId: string): Promise<DiagnosisRecord>;
  listDiagnoses(query: HistoryQuery): Promise<DiagnosisListItemPage>;
  setSaved(diagnosisId: string, saved: boolean): Promise<void>;
  deleteDiagnosis(diagnosisId: string): Promise<void>;
  getRepairGuide(diagnosisId: string): Promise<RepairGuide | null>;
  getRepairProgress(diagnosisId: string): Promise<RepairProgress | null>;
  saveRepairProgress(diagnosisId: string, input: SaveProgressInput): Promise<RepairProgress>;
  submitFeedback(input: SubmitFeedbackInput): Promise<DiagnosisFeedback>;
  getFeedback(diagnosisId: string): Promise<DiagnosisFeedback | null>;
  getUsage(): Promise<UsageSummary>;
  listQuotes(diagnosisId: string): Promise<CostQuote[]>;
  addQuote(input: NewCostQuote): Promise<CostQuote>;
  deleteQuote(quoteId: string): Promise<void>;
  listMaintenance(): Promise<MaintenanceTask[]>;
  createMaintenance(input: CreateMaintenanceInput): Promise<MaintenanceTask>;
  updateMaintenance(taskId: string, input: CreateMaintenanceInput): Promise<MaintenanceTask>;
  completeMaintenance(taskId: string): Promise<MaintenanceTask>;
  setMaintenanceNotificationId(
    taskId: string,
    notificationId: string | null,
  ): Promise<MaintenanceTask>;
  deleteMaintenance(taskId: string): Promise<void>;
  sendSupportMessage(input: SupportMessageInput): Promise<void>;
  exportUserData(): Promise<ExportBundle>;
  deleteAllData(): Promise<void>;
}

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  isDemo: boolean;
};

export type AuthSession = {
  user: AuthUser;
  expiresAt: string | null;
};

export interface AuthService {
  readonly mode: 'demo' | 'live';
  getSession(): Promise<AuthSession | null>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signUp(input: { email: string; password: string; displayName: string }): Promise<{
    session: AuthSession | null;
    needsEmailConfirmation: boolean;
  }>;
  signInDemo(): Promise<AuthSession>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  completePasswordRecovery(url: string): Promise<void>;
  deleteAccount(): Promise<void>;
  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void;
}
