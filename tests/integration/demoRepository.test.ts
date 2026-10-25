import { createDemoRepository, type KeyValueStore } from '@/services/repositories/demoRepository';
import { parseAnalysis } from '@/domain/diagnosis/schema';
import { compareQuotes } from '@/domain/diagnosis/cost';
import type { DiagnosisImage } from '@/domain/diagnosis/types';

const NOW = new Date('2026-10-15T10:00:00.000Z');

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    async getItem(key) {
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
    async removeItem(key) {
      data.delete(key);
    },
  };
}

function createRepository(store = memoryStore()) {
  const deleteImages = jest.fn();
  const repo = createDemoRepository({
    userId: 'integration-user',
    email: 'integration@example.com',
    displayName: 'Integration User',
    store,
    now: () => NOW,
    analysisDelayMs: 0,
    copyImages: async (uris): Promise<DiagnosisImage[]> =>
      uris.map((uri, index) => ({
        id: `image-${index}`,
        localUri: uri,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        position: index,
      })),
    deleteImages,
  });
  return { repo, deleteImages };
}

describe('demo repository integration flow', () => {
  it('persists a diagnosis through analysis, guide, feedback, quotes, maintenance, and export', async () => {
    const { repo, deleteImages } = createRepository();

    const created = await repo.createDiagnosis({
      id: 'diag-1',
      category: 'appliance',
      description: 'The washing machine leaks water from the door during the spin cycle.',
      brand: 'Example',
      model: 'WM-100',
      errorCode: null,
      itemAgeYears: 4,
      currency: 'MAD',
      locale: 'en',
      imageUris: ['file:///photo-1.jpg', 'file:///photo-2.jpg'],
    });

    expect(created.status).toBe('draft');
    expect(created.images).toHaveLength(2);
    expect(created.analysis).toBeNull();

    await repo.startAnalysis('diag-1');
    const completed = await repo.getDiagnosis('diag-1');
    expect(completed.status).toBe('completed');
    expect(completed.analysis).not.toBeNull();
    expect(completed.analysis?.provider.mode).toBe('demo');
    expect(completed.safetyLevel).toBe(completed.analysis?.safety.risk_level);
    expect(parseAnalysis(completed.analysis).success).toBe(true);

    const usage = await repo.getUsage();
    expect(usage.used).toBe(1);
    expect(usage.limit).toBe(5);
    expect(usage.remaining).toBe(4);

    const history = await repo.listDiagnoses({ limit: 10 });
    expect(history.items).toHaveLength(1);
    expect(history.items[0]?.id).toBe('diag-1');
    expect(history.total).toBe(1);

    const guide = await repo.getRepairGuide('diag-1');
    expect(guide).not.toBeNull();
    if (!guide) throw new Error('Expected a repair guide');
    expect(guide.steps.length).toBeGreaterThan(0);
    const firstStep = guide.steps[0];
    if (!firstStep) throw new Error('Expected a repair step');

    const progress = await repo.saveRepairProgress('diag-1', {
      completedStepIds: [firstStep.id],
      currentStep: 1,
      completedAt: null,
    });
    expect(progress.completedStepIds).toEqual([firstStep.id]);
    expect((await repo.getRepairProgress('diag-1'))?.currentStep).toBe(1);

    const feedback = await repo.submitFeedback({
      diagnosisId: 'diag-1',
      rating: 3,
      reason: 'unclear',
      comment: 'The steps were hard to follow.',
    });
    expect(feedback.rating).toBe(3);
    expect((await repo.getFeedback('diag-1'))?.reason).toBe('unclear');

    const repairQuote = await repo.addQuote({
      diagnosisId: 'diag-1',
      type: 'repair',
      label: 'Local technician',
      amount: 900,
      currency: 'MAD',
      includesParts: true,
      includesLabor: true,
      notes: null,
    });
    await repo.addQuote({
      diagnosisId: 'diag-1',
      type: 'replacement',
      label: 'New appliance',
      amount: 1500,
      currency: 'MAD',
      includesParts: true,
      includesLabor: true,
      notes: null,
    });
    const quotes = await repo.listQuotes('diag-1');
    expect(quotes).toHaveLength(2);
    const comparison = compareQuotes(quotes);
    expect(comparison.cheapestRepair?.id).toBe(repairQuote.id);
    expect(comparison.savingsVsReplacement).toBe(600);

    const task = await repo.createMaintenance({
      itemDescription: 'Washing machine',
      taskDescription: 'Clean the filter',
      frequency: 'monthly',
      nextDueDate: '2026-10-15',
      reminderEnabled: false,
      lastCompletedAt: null,
      notes: null,
      isActive: true,
    });
    const completedTask = await repo.completeMaintenance(task.id);
    expect(completedTask.lastCompletedAt).toBe(NOW.toISOString());
    expect(completedTask.nextDueDate).toBe('2026-11-15');
    expect(await repo.listMaintenance()).toHaveLength(1);

    await repo.sendSupportMessage({
      category: 'diagnosis',
      message: 'The guide was useful.',
      email: 'integration@example.com',
      diagnosisId: 'diag-1',
    });

    const exported = await repo.exportUserData();
    expect(exported.app).toBe('SNAPFIX');
    expect(exported.diagnoses).toHaveLength(1);
    expect(exported.feedback).toHaveLength(1);
    expect(exported.quotes).toHaveLength(2);
    expect(exported.progress).toHaveLength(1);
    expect(exported.maintenance).toHaveLength(1);
    expect(exported.profile?.displayName).toBe('Integration User');
    expect(exported.usage?.used).toBe(1);
    expect(exported.support).toHaveLength(1);

    await repo.deleteAllData();
    expect(deleteImages).toHaveBeenCalledWith('integration-user', 'diag-1');
    await expect(repo.getDiagnosis('diag-1')).rejects.toMatchObject({ code: 'not_found' });
    expect(await repo.listMaintenance()).toHaveLength(0);
    expect(await repo.getFeedback('diag-1')).toBeNull();
  });

  it('enforces the free monthly analysis quota', async () => {
    const { repo } = createRepository();

    for (let index = 1; index <= 5; index += 1) {
      const id = `quota-${index}`;
      await repo.createDiagnosis({
        id,
        category: 'furniture',
        description: 'The wooden chair has a loose screw in the backrest.',
        currency: 'MAD',
        locale: 'en',
        imageUris: ['file:///chair.jpg'],
      });
      await repo.startAnalysis(id);
    }

    expect((await repo.getUsage()).used).toBe(5);
    await repo.createDiagnosis({
      id: 'quota-6',
      category: 'furniture',
      description: 'The wooden chair has a loose screw in the backrest.',
      currency: 'MAD',
      locale: 'en',
      imageUris: ['file:///chair.jpg'],
    });

    await expect(repo.startAnalysis('quota-6')).rejects.toMatchObject({
      code: 'quota_exceeded',
    });
    expect((await repo.getUsage()).remaining).toBe(0);
  });

  it('allows one reassessment and rejects further attempts', async () => {
    const { repo } = createRepository();
    await repo.createDiagnosis({
      id: 'reassess-1',
      category: 'furniture',
      description: 'The wooden chair has a loose screw in the backrest.',
      currency: 'MAD',
      locale: 'en',
      imageUris: ['file:///chair.jpg'],
    });
    await repo.startAnalysis('reassess-1');
    await repo.reassessDiagnosis('reassess-1');
    expect((await repo.getDiagnosis('reassess-1')).analysisAttempts).toBe(2);

    await expect(repo.reassessDiagnosis('reassess-1')).rejects.toMatchObject({
      code: 'rate_limited',
    });
  });
});
