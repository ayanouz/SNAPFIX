import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppError } from '@/domain/errors';
import { PLAN_LIMITS, currentMonthPeriod, usageSummary } from '@/domain/usage';
import type {
  CostQuote,
  DiagnosisFeedback,
  DiagnosisImage,
  DiagnosisListItemPage,
  DiagnosisRecord,
  HistoryQuery,
  MaintenanceTask,
  NewCostQuote,
  NewDiagnosisInput,
  RepairGuide,
  RepairProgress,
  SupportMessage,
  UsageSummary,
  UserProfile,
} from '@/domain/diagnosis/types';
import { generateDemoAnalysis } from '@/services/demo/demoAnalyzer';
import { addMonthsToDate } from '@/utils/format';
import { createId } from '@/utils/ids';
import type {
  CreateMaintenanceInput,
  DataRepository,
  ExportBundle,
  ProfileUpdate,
  SaveProgressInput,
  SubmitFeedbackInput,
  SupportMessageInput,
} from './types';

export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type DemoUsageEvent = {
  diagnosisId: string;
  createdAt: string;
};

type DemoDatabase = {
  version: 1;
  diagnoses: DiagnosisRecord[];
  usageEvents: DemoUsageEvent[];
  progress: RepairProgress[];
  feedback: DiagnosisFeedback[];
  quotes: CostQuote[];
  maintenance: MaintenanceTask[];
  support: SupportMessage[];
};

export type DemoRepositoryOptions = {
  userId: string;
  email?: string;
  displayName?: string;
  store?: KeyValueStore;
  now?: () => Date;
  analysisDelayMs?: number;
  copyImages?: (uris: string[], userId: string, diagnosisId: string) => Promise<DiagnosisImage[]>;
  deleteImages?: (userId: string, diagnosisId: string) => void;
  maxPhotos?: number;
};

const EMPTY_DB: DemoDatabase = {
  version: 1,
  diagnoses: [],
  usageEvents: [],
  progress: [],
  feedback: [],
  quotes: [],
  maintenance: [],
  support: [],
};

function dbKey(userId: string): string {
  return `snapfix.demo.v1.${userId}.db`;
}

function profileKey(userId: string): string {
  return `snapfix.demo.v1.${userId}.profile`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sleep(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

function isWithinPeriod(iso: string, start: Date, end: Date): boolean {
  const time = new Date(iso).getTime();
  return time >= start.getTime() && time < end.getTime();
}

export function createDemoRepository(options: DemoRepositoryOptions): DataRepository {
  const store = options.store ?? AsyncStorage;
  const now = options.now ?? (() => new Date());
  const analysisDelayMs = options.analysisDelayMs ?? 1400;
  const maxPhotos = options.maxPhotos ?? PLAN_LIMITS.free.maxPhotos;
  const key = dbKey(options.userId);
  const profileStorageKey = profileKey(options.userId);
  let queue: Promise<unknown> = Promise.resolve();
  const running = new Map<string, Promise<void>>();

  function defaultProfile(): UserProfile {
    return {
      id: options.userId,
      displayName: options.displayName?.trim() || 'SNAPFIX user',
      email: options.email?.trim() || '',
      preferredLanguage: 'en',
      preferredCurrency: 'MAD',
      theme: 'system',
      createdAt: now().toISOString(),
    };
  }

  async function readProfile(): Promise<UserProfile> {
    const raw = await store.getItem(profileStorageKey);
    if (!raw) return defaultProfile();
    try {
      const parsed = JSON.parse(raw) as Partial<UserProfile>;
      return { ...defaultProfile(), ...parsed, id: options.userId };
    } catch {
      return defaultProfile();
    }
  }

  async function writeProfile(profile: UserProfile): Promise<void> {
    await store.setItem(profileStorageKey, JSON.stringify(profile));
  }

  async function readDb(): Promise<DemoDatabase> {
    const raw = await store.getItem(key);
    if (!raw) return clone(EMPTY_DB);
    try {
      const parsed = JSON.parse(raw) as Partial<DemoDatabase>;
      return {
        ...clone(EMPTY_DB),
        ...parsed,
        version: 1,
        diagnoses: parsed.diagnoses ?? [],
        usageEvents: parsed.usageEvents ?? [],
        progress: parsed.progress ?? [],
        feedback: parsed.feedback ?? [],
        quotes: parsed.quotes ?? [],
        maintenance: parsed.maintenance ?? [],
        support: parsed.support ?? [],
      };
    } catch {
      throw new AppError('unknown', 'Local SNAPFIX data could not be read');
    }
  }

  async function writeDb(db: DemoDatabase): Promise<void> {
    await store.setItem(key, JSON.stringify(db));
  }

  function withLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function defaultCopyImages(
    uris: string[],
    userId: string,
    diagnosisId: string,
  ): Promise<DiagnosisImage[]> {
    const { copyIntoDiagnosisFolder } = await import('@/services/storage/imageService');
    const images: DiagnosisImage[] = [];
    for (let index = 0; index < uris.length; index += 1) {
      const uri = uris[index];
      if (!uri) continue;
      const prepared = await copyIntoDiagnosisFolder(
        { uri, width: 0, height: 0, sizeBytes: 0, mimeType: 'image/jpeg' },
        userId,
        diagnosisId,
        index,
      );
      images.push({
        id: createId(),
        localUri: prepared.uri,
        mimeType: 'image/jpeg',
        sizeBytes: prepared.sizeBytes,
        position: index,
      });
    }
    return images;
  }

  async function defaultDeleteImages(userId: string, diagnosisId: string): Promise<void> {
    const { deleteDiagnosisImages } = await import('@/services/storage/imageService');
    deleteDiagnosisImages(userId, diagnosisId);
  }

  const copyImages = options.copyImages ?? defaultCopyImages;
  const removeImages = options.deleteImages ?? defaultDeleteImages;

  function findDiagnosis(db: DemoDatabase, diagnosisId: string): DiagnosisRecord {
    const record = db.diagnoses.find((entry) => entry.id === diagnosisId);
    if (!record) throw new AppError('not_found', 'Diagnosis not found');
    return record;
  }

  async function ensureUsageAllowed(db: DemoDatabase, diagnosisId: string): Promise<void> {
    const alreadyUsed = db.usageEvents.some((event) => event.diagnosisId === diagnosisId);
    if (alreadyUsed) return;
    const period = currentMonthPeriod(now());
    const used = db.usageEvents.filter((event) =>
      isWithinPeriod(event.createdAt, period.start, period.end),
    ).length;
    if (used >= PLAN_LIMITS.free.diagnosesPerMonth) {
      throw new AppError('quota_exceeded', 'Monthly diagnosis limit reached');
    }
    db.usageEvents.push({ diagnosisId, createdAt: now().toISOString() });
  }

  async function runAnalysis(diagnosisId: string, isReassessment: boolean): Promise<void> {
    const existing = running.get(diagnosisId);
    if (existing) return existing;

    const task = (async () => {
      const record = await withLock(async () => {
        const db = await readDb();
        const current = findDiagnosis(db, diagnosisId);

        // A completed first analysis is idempotent. Reassessment is the only
        // path that may replace an existing analysis.
        if (current.status === 'completed' && !isReassessment) return current;
        if (current.status === 'analyzing' || current.status === 'uploading') {
          throw new AppError('conflict', 'An analysis is already running');
        }
        if (isReassessment && current.status !== 'completed') {
          throw new AppError('invalid_input', 'Only a completed diagnosis can be reassessed');
        }
        if (current.analysisAttempts >= 1 + PLAN_LIMITS.free.maxReassessments) {
          throw new AppError('rate_limited', 'Reassessment limit reached');
        }
        if (!isReassessment) {
          await ensureUsageAllowed(db, diagnosisId);
        }

        // Attempts are counted only after a successful analysis. A failed
        // first attempt or reassessment must not consume the user's allowance.
        const updated: DiagnosisRecord = {
          ...current,
          status: 'analyzing',
          failureCode: null,
          failureMessage: null,
          updatedAt: now().toISOString(),
        };
        db.diagnoses = db.diagnoses.map((entry) => (entry.id === diagnosisId ? updated : entry));
        await writeDb(db);
        return updated;
      });

      if (record.status !== 'analyzing') return;

      await sleep(analysisDelayMs);

      try {
        const analysis = generateDemoAnalysis({
          category: record.category,
          description: record.description,
          brand: record.brand,
          model: record.model,
          errorCode: record.errorCode,
          imageCount: record.images.length,
          locale: record.locale,
          currency: record.currency,
        });

        await withLock(async () => {
          const db = await readDb();
          const current = findDiagnosis(db, diagnosisId);
          const updated: DiagnosisRecord = {
            ...current,
            status: 'completed',
            analysis,
            safetyLevel: analysis.safety.risk_level,
            analysisAttempts: current.analysisAttempts + 1,
            completedAt: now().toISOString(),
            updatedAt: now().toISOString(),
            failureCode: null,
            failureMessage: null,
          };
          db.diagnoses = db.diagnoses.map((entry) => (entry.id === diagnosisId ? updated : entry));
          await writeDb(db);
        });
      } catch (error) {
        await withLock(async () => {
          const db = await readDb();
          const current = db.diagnoses.find((entry) => entry.id === diagnosisId);
          if (!current) return;
          // If a reassessment fails, keep the previous completed result and
          // allowance. The caller receives the error and can retry.
          const restoredStatus = isReassessment && current.analysis ? 'completed' : 'failed';
          db.diagnoses = db.diagnoses.map((entry) =>
            entry.id === diagnosisId
              ? {
                  ...current,
                  status: restoredStatus,
                  failureCode: isReassessment ? null : 'analysis_failed',
                  failureMessage: isReassessment
                    ? null
                    : 'The local demo analysis could not be completed.',
                  updatedAt: now().toISOString(),
                }
              : entry,
          );
          await writeDb(db);
        });
        throw error;
      }
    })().finally(() => {
      running.delete(diagnosisId);
    });

    running.set(diagnosisId, task);
    return task;
  }

  return {
    mode: 'demo',

    async getProfile(): Promise<UserProfile> {
      return readProfile();
    },

    async updateProfile(input: ProfileUpdate): Promise<UserProfile> {
      return withLock(async () => {
        const current = await readProfile();
        const updated: UserProfile = {
          ...current,
          displayName:
            input.displayName !== undefined
              ? input.displayName.trim().slice(0, 80) || current.displayName
              : current.displayName,
          preferredLanguage: input.preferredLanguage ?? current.preferredLanguage,
          preferredCurrency:
            input.preferredCurrency !== undefined
              ? input.preferredCurrency.toUpperCase()
              : current.preferredCurrency,
          theme: input.theme ?? current.theme,
        };
        await writeProfile(updated);
        return updated;
      });
    },

    async createDiagnosis(input: NewDiagnosisInput): Promise<DiagnosisRecord> {
      if (input.imageUris.length === 0) {
        throw new AppError('invalid_input', 'At least one photo is required');
      }
      if (input.imageUris.length > maxPhotos) {
        throw new AppError('invalid_input', `Attach at most ${maxPhotos} photos`);
      }
      if (input.description.trim().length < 10) {
        throw new AppError('invalid_input', 'Describe the problem in at least 10 characters');
      }

      const existing = await withLock(async () => {
        const db = await readDb();
        return db.diagnoses.find((entry) => entry.id === input.id) ?? null;
      });
      if (existing) return existing;

      const images = await copyImages(input.imageUris, options.userId, input.id);
      const timestamp = now().toISOString();
      const record: DiagnosisRecord = {
        id: input.id,
        userId: options.userId,
        status: 'draft',
        category: input.category,
        description: input.description.trim(),
        brand: input.brand?.trim() || null,
        model: input.model?.trim() || null,
        errorCode: input.errorCode?.trim() || null,
        itemAgeYears: input.itemAgeYears ?? null,
        currency: input.currency.toUpperCase(),
        locale: input.locale,
        analysis: null,
        safetyLevel: 'low',
        failureCode: null,
        failureMessage: null,
        isSaved: true,
        analysisAttempts: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        images,
      };

      return withLock(async () => {
        const db = await readDb();
        const duplicate = db.diagnoses.find((entry) => entry.id === input.id);
        if (duplicate) return duplicate;
        db.diagnoses.push(record);
        await writeDb(db);
        return record;
      });
    },

    async startAnalysis(diagnosisId: string): Promise<void> {
      await runAnalysis(diagnosisId, false);
    },

    async reassessDiagnosis(diagnosisId: string): Promise<void> {
      const db = await readDb();
      const record = findDiagnosis(db, diagnosisId);
      if (record.status !== 'completed') {
        throw new AppError('invalid_input', 'Only a completed diagnosis can be reassessed');
      }
      await runAnalysis(diagnosisId, true);
    },

    async getDiagnosis(diagnosisId: string): Promise<DiagnosisRecord> {
      const db = await readDb();
      return clone(findDiagnosis(db, diagnosisId));
    },

    async listDiagnoses(query: HistoryQuery): Promise<DiagnosisListItemPage> {
      const db = await readDb();
      const limit = Math.min(Math.max(query.limit ?? 10, 1), 20);
      const offset = Math.max(query.offset ?? 0, 0);
      const search = query.search?.trim().toLowerCase() ?? '';
      const usage = usageSummary(
        'free',
        db.usageEvents.filter((event) =>
          isWithinPeriod(
            event.createdAt,
            currentMonthPeriod(now()).start,
            currentMonthPeriod(now()).end,
          ),
        ).length,
        now(),
      );
      const historyCap = usage.historyLimit ?? Number.MAX_SAFE_INTEGER;

      const filtered = db.diagnoses
        .filter((record) => record.status !== 'draft')
        .filter((record) => (query.category ? record.category === query.category : true))
        .filter((record) => (query.savedOnly ? record.isSaved : true))
        .filter((record) => {
          if (!search) return true;
          return `${record.description} ${record.brand ?? ''} ${record.model ?? ''} ${
            record.analysis?.item.identified_type ?? ''
          } ${record.analysis?.summary.headline ?? ''}`
            .toLowerCase()
            .includes(search);
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const cappedTotal = Math.min(filtered.length, historyCap);
      const remainingCap = Math.max(0, historyCap - offset);
      const effectiveLimit = Math.min(limit, remainingCap);
      const items = filtered.slice(offset, offset + effectiveLimit).map((record) => ({
        id: record.id,
        status: record.status,
        category: record.category,
        description: record.description,
        safetyLevel: record.safetyLevel,
        createdAt: record.createdAt,
        completedAt: record.completedAt,
        isSaved: record.isSaved,
        errorCode: record.errorCode,
        identifiedType: record.analysis?.item.identified_type ?? null,
        thumbnailUri: record.images[0]?.localUri ?? record.images[0]?.signedUrl ?? null,
      }));

      const next = offset + items.length < cappedTotal ? offset + items.length : null;
      return { items, nextOffset: next, total: cappedTotal };
    },

    async setSaved(diagnosisId: string, saved: boolean): Promise<void> {
      await withLock(async () => {
        const db = await readDb();
        const record = findDiagnosis(db, diagnosisId);
        record.isSaved = saved;
        record.updatedAt = now().toISOString();
        await writeDb(db);
      });
    },

    async deleteDiagnosis(diagnosisId: string): Promise<void> {
      await withLock(async () => {
        const db = await readDb();
        findDiagnosis(db, diagnosisId);
        db.diagnoses = db.diagnoses.filter((entry) => entry.id !== diagnosisId);
        db.progress = db.progress.filter((entry) => entry.diagnosisId !== diagnosisId);
        db.feedback = db.feedback.filter((entry) => entry.diagnosisId !== diagnosisId);
        db.quotes = db.quotes.filter((entry) => entry.diagnosisId !== diagnosisId);
        await writeDb(db);
      });
      removeImages(options.userId, diagnosisId);
    },

    async getRepairGuide(diagnosisId: string): Promise<RepairGuide | null> {
      const db = await readDb();
      const record = findDiagnosis(db, diagnosisId);
      if (!record.analysis || record.analysis.safety.professional_required) return null;
      const option = record.analysis.repair_options[0];
      if (!option) return null;
      return {
        id: `guide-${diagnosisId}`,
        diagnosisId,
        title: option.title,
        version: 1,
        steps: option.steps,
        tools: option.tools,
        materials: option.materials,
        difficulty: option.difficulty,
        durationMinutes: option.duration_minutes,
        professionalOnly: option.professional_only,
        safetyWarnings: record.analysis.safety.warnings,
        sourceOptionIndex: 0,
        createdAt: record.completedAt ?? record.createdAt,
      };
    },

    async getRepairProgress(diagnosisId: string): Promise<RepairProgress | null> {
      const db = await readDb();
      findDiagnosis(db, diagnosisId);
      return clone(db.progress.find((entry) => entry.diagnosisId === diagnosisId) ?? null);
    },

    async saveRepairProgress(
      diagnosisId: string,
      input: SaveProgressInput,
    ): Promise<RepairProgress> {
      return withLock(async () => {
        const db = await readDb();
        const record = findDiagnosis(db, diagnosisId);
        if (!record.analysis) throw new AppError('invalid_input', 'Diagnosis is not complete');
        const guide = record.analysis.repair_options[0];
        const maxSteps = guide?.steps.length ?? 0;
        if (input.currentStep < 0 || input.currentStep > maxSteps) {
          throw new AppError('invalid_input', 'Invalid repair step');
        }
        const validStepIds = new Set(guide?.steps.map((step) => step.id) ?? []);
        const completedStepIds = [...new Set(input.completedStepIds)].filter((id) =>
          validStepIds.has(id),
        );
        const existing = db.progress.find((entry) => entry.diagnosisId === diagnosisId);
        const progress: RepairProgress = {
          diagnosisId,
          userId: options.userId,
          completedStepIds,
          currentStep: input.currentStep,
          completedAt:
            input.completedAt ??
            (maxSteps > 0 && completedStepIds.length === maxSteps ? now().toISOString() : null),
          updatedAt: now().toISOString(),
        };
        db.progress = existing
          ? db.progress.map((entry) => (entry.diagnosisId === diagnosisId ? progress : entry))
          : [...db.progress, progress];
        await writeDb(db);
        return clone(progress);
      });
    },

    async submitFeedback(input: SubmitFeedbackInput): Promise<DiagnosisFeedback> {
      return withLock(async () => {
        const db = await readDb();
        findDiagnosis(db, input.diagnosisId);
        const existing = db.feedback.find((entry) => entry.diagnosisId === input.diagnosisId);
        const feedback: DiagnosisFeedback = {
          id: existing?.id ?? createId(),
          diagnosisId: input.diagnosisId,
          rating: Math.max(1, Math.min(5, input.rating)),
          reason: input.reason,
          comment: input.comment?.trim() || null,
          createdAt: now().toISOString(),
        };
        db.feedback = existing
          ? db.feedback.map((entry) => (entry.diagnosisId === input.diagnosisId ? feedback : entry))
          : [...db.feedback, feedback];
        await writeDb(db);
        return clone(feedback);
      });
    },

    async getFeedback(diagnosisId: string): Promise<DiagnosisFeedback | null> {
      const db = await readDb();
      return clone(db.feedback.find((entry) => entry.diagnosisId === diagnosisId) ?? null);
    },

    async getUsage(): Promise<UsageSummary> {
      const db = await readDb();
      const period = currentMonthPeriod(now());
      const used = db.usageEvents.filter((event) =>
        isWithinPeriod(event.createdAt, period.start, period.end),
      ).length;
      return usageSummary('free', used, now());
    },

    async listQuotes(diagnosisId: string): Promise<CostQuote[]> {
      const db = await readDb();
      findDiagnosis(db, diagnosisId);
      return clone(
        db.quotes
          .filter((quote) => quote.diagnosisId === diagnosisId)
          .sort((a, b) => a.amount - b.amount),
      );
    },

    async addQuote(input: NewCostQuote): Promise<CostQuote> {
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw new AppError('invalid_input', 'Enter a valid amount');
      }
      return withLock(async () => {
        const db = await readDb();
        findDiagnosis(db, input.diagnosisId);
        const quote: CostQuote = {
          ...input,
          id: createId(),
          currency: input.currency.toUpperCase(),
          label: input.label.trim(),
          notes: input.notes?.trim() || null,
          createdAt: now().toISOString(),
        };
        db.quotes.push(quote);
        await writeDb(db);
        return clone(quote);
      });
    },

    async deleteQuote(quoteId: string): Promise<void> {
      await withLock(async () => {
        const db = await readDb();
        db.quotes = db.quotes.filter((quote) => quote.id !== quoteId);
        await writeDb(db);
      });
    },

    async listMaintenance(): Promise<MaintenanceTask[]> {
      const db = await readDb();
      return clone(db.maintenance.sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate)));
    },

    async createMaintenance(input: CreateMaintenanceInput): Promise<MaintenanceTask> {
      return withLock(async () => {
        const db = await readDb();
        const timestamp = now().toISOString();
        const task: MaintenanceTask = {
          ...input,
          id: createId(),
          userId: options.userId,
          notificationId: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          notes: input.notes?.trim() || null,
        };
        db.maintenance.push(task);
        await writeDb(db);
        return clone(task);
      });
    },

    async updateMaintenance(
      taskId: string,
      input: CreateMaintenanceInput,
    ): Promise<MaintenanceTask> {
      return withLock(async () => {
        const db = await readDb();
        const task = db.maintenance.find((entry) => entry.id === taskId);
        if (!task) throw new AppError('not_found', 'Maintenance task not found');
        const updated: MaintenanceTask = {
          ...task,
          ...input,
          notes: input.notes?.trim() || null,
          updatedAt: now().toISOString(),
        };
        db.maintenance = db.maintenance.map((entry) => (entry.id === taskId ? updated : entry));
        await writeDb(db);
        return clone(updated);
      });
    },

    async completeMaintenance(taskId: string): Promise<MaintenanceTask> {
      return withLock(async () => {
        const db = await readDb();
        const task = db.maintenance.find((entry) => entry.id === taskId);
        if (!task) throw new AppError('not_found', 'Maintenance task not found');
        const completedAt = now().toISOString();
        const frequencyMonths: Record<MaintenanceTask['frequency'], number | null> = {
          once: null,
          weekly: 0,
          monthly: 1,
          quarterly: 3,
          biannual: 6,
          yearly: 12,
        };
        let nextDueDate = task.nextDueDate;
        if (task.frequency === 'weekly') {
          const next = new Date(`${task.nextDueDate}T12:00:00.000Z`);
          next.setUTCDate(next.getUTCDate() + 7);
          nextDueDate = next.toISOString().slice(0, 10);
        } else {
          const months = frequencyMonths[task.frequency];
          if (months !== null) nextDueDate = addMonthsToDate(task.nextDueDate, months);
        }
        const updated: MaintenanceTask = {
          ...task,
          lastCompletedAt: completedAt,
          nextDueDate,
          isActive: task.frequency !== 'once',
          notificationId: null,
          updatedAt: completedAt,
        };
        db.maintenance = db.maintenance.map((entry) => (entry.id === taskId ? updated : entry));
        await writeDb(db);
        return clone(updated);
      });
    },

    async setMaintenanceNotificationId(
      taskId: string,
      notificationId: string | null,
    ): Promise<MaintenanceTask> {
      return withLock(async () => {
        const db = await readDb();
        const task = db.maintenance.find((entry) => entry.id === taskId);
        if (!task) throw new AppError('not_found', 'Maintenance task not found');
        const updated = { ...task, notificationId, updatedAt: now().toISOString() };
        db.maintenance = db.maintenance.map((entry) => (entry.id === taskId ? updated : entry));
        await writeDb(db);
        return clone(updated);
      });
    },

    async deleteMaintenance(taskId: string): Promise<void> {
      await withLock(async () => {
        const db = await readDb();
        db.maintenance = db.maintenance.filter((entry) => entry.id !== taskId);
        await writeDb(db);
      });
    },

    async sendSupportMessage(input: SupportMessageInput): Promise<void> {
      await withLock(async () => {
        const db = await readDb();
        db.support.push({
          ...input,
          id: createId(),
          createdAt: now().toISOString(),
        });
        await writeDb(db);
      });
    },

    async exportUserData(): Promise<ExportBundle> {
      const db = await readDb();
      const period = currentMonthPeriod(now());
      const used = db.usageEvents.filter((event) =>
        isWithinPeriod(event.createdAt, period.start, period.end),
      ).length;
      return {
        exportedAt: now().toISOString(),
        app: 'SNAPFIX',
        schemaVersion: 1,
        diagnoses: clone(db.diagnoses),
        maintenance: clone(db.maintenance),
        feedback: clone(db.feedback),
        quotes: clone(db.quotes),
        progress: clone(db.progress),
        profile: await readProfile(),
        usage: usageSummary('free', used, now()),
        support: clone(db.support),
      };
    },

    async deleteAllData(): Promise<void> {
      const db = await readDb();
      for (const record of db.diagnoses) {
        removeImages(options.userId, record.id);
      }
      await store.removeItem(key);
      await store.removeItem(profileStorageKey);
    },
  };
}
