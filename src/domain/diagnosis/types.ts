import type {
  Category,
  DiagnosisAnalysis,
  Estimate,
  NextStep,
  RepairOption,
  SafetyLevel,
} from './schema';

export const DIAGNOSIS_STATUSES = [
  'draft',
  'uploading',
  'analyzing',
  'completed',
  'failed',
] as const;
export type DiagnosisStatus = (typeof DIAGNOSIS_STATUSES)[number];

export type DiagnosisImage = {
  id: string;
  localUri?: string;
  storagePath?: string;
  signedUrl?: string;
  mimeType: string;
  sizeBytes: number;
  position: number;
};

export type DiagnosisRecord = {
  id: string;
  userId: string;
  status: DiagnosisStatus;
  category: Category;
  description: string;
  brand: string | null;
  model: string | null;
  errorCode: string | null;
  itemAgeYears: number | null;
  currency: string;
  locale: string;
  analysis: DiagnosisAnalysis | null;
  safetyLevel: SafetyLevel;
  failureCode: string | null;
  failureMessage: string | null;
  isSaved: boolean;
  analysisAttempts: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  images: DiagnosisImage[];
};

export type DiagnosisSummary = Pick<
  DiagnosisRecord,
  | 'id'
  | 'status'
  | 'category'
  | 'description'
  | 'safetyLevel'
  | 'createdAt'
  | 'completedAt'
  | 'isSaved'
  | 'errorCode'
> & {
  identifiedType: string | null;
  thumbnailUri: string | null;
};

export type NewDiagnosisInput = {
  id: string;
  category: Category;
  description: string;
  brand?: string | null;
  model?: string | null;
  errorCode?: string | null;
  itemAgeYears?: number | null;
  currency: string;
  locale: string;
  imageUris: string[];
};

export type DiagnosisDetailInput = Omit<NewDiagnosisInput, 'imageUris'>;

export type RepairProgress = {
  diagnosisId: string;
  userId: string;
  completedStepIds: string[];
  currentStep: number;
  completedAt: string | null;
  updatedAt: string;
};

export type RepairGuide = {
  id: string;
  diagnosisId: string;
  title: string;
  version: number;
  steps: RepairOption['steps'];
  tools: string[];
  materials: string[];
  difficulty: RepairOption['difficulty'];
  durationMinutes: { min: number; max: number };
  professionalOnly: boolean;
  safetyWarnings: DiagnosisAnalysis['safety']['warnings'];
  sourceOptionIndex: number;
  createdAt: string;
};

export type MaintenanceFrequency =
  'once' | 'weekly' | 'monthly' | 'quarterly' | 'biannual' | 'yearly';

export type MaintenanceTask = {
  id: string;
  userId: string;
  itemDescription: string;
  taskDescription: string;
  frequency: MaintenanceFrequency;
  nextDueDate: string;
  reminderEnabled: boolean;
  lastCompletedAt: string | null;
  notificationId: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NewMaintenanceTask = Omit<
  MaintenanceTask,
  'id' | 'userId' | 'notificationId' | 'createdAt' | 'updatedAt'
>;

export type DiagnosisFeedback = {
  id: string;
  diagnosisId: string;
  rating: number;
  reason: FeedbackReason | null;
  comment: string | null;
  createdAt: string;
};

export const FEEDBACK_REASONS = [
  'wrong_item',
  'unsafe',
  'unclear',
  'missing_steps',
  'other',
] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export type SupportMessage = {
  id: string;
  category: 'bug' | 'diagnosis' | 'privacy' | 'billing' | 'other';
  message: string;
  email: string | null;
  diagnosisId: string | null;
  createdAt: string;
};

export type UsageSummary = {
  plan: 'free' | 'premium';
  used: number;
  limit: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
  historyLimit: number | null;
  maxPhotos: number;
  maxReassessments: number;
};

export type CostQuote = {
  id: string;
  diagnosisId: string;
  type: 'repair' | 'replacement';
  label: string;
  amount: number;
  currency: string;
  includesParts: boolean;
  includesLabor: boolean;
  notes: string | null;
  createdAt: string;
};

export type NewCostQuote = Omit<CostQuote, 'id' | 'createdAt'>;

export type Entitlement = {
  plan: 'free' | 'premium';
  status: 'active' | 'inactive' | 'expired';
  provider: string | null;
  currentPeriodEnd: string | null;
};

export type UserProfile = {
  id: string;
  displayName: string;
  email: string;
  preferredLanguage: string;
  preferredCurrency: string;
  theme: 'system' | 'light' | 'dark';
  createdAt: string;
};

export type AnalysisEstimate = Estimate;
export type AnalysisNextStep = NextStep;

export type DiagnosisListItemPage = {
  items: DiagnosisSummary[];
  nextOffset: number | null;
  total: number | null;
};

export type HistoryQuery = {
  search?: string;
  category?: Category | null;
  savedOnly?: boolean;
  limit?: number;
  offset?: number;
};

export const DEMO_USER_ID = 'demo-user';
export const DEMO_EMAIL = 'demo@snapfix.local';
