import { useDiagnosisDraft } from '@/stores/diagnosisDraft';

describe('diagnosis draft ownership', () => {
  beforeEach(() => {
    useDiagnosisDraft.getState().reset();
  });

  it('clears values when the signed-in owner changes', () => {
    useDiagnosisDraft.getState().setOwner('user-a');
    useDiagnosisDraft.getState().setDescription('A private description');
    useDiagnosisDraft.getState().addPhoto({
      uri: 'file:///private.jpg',
      width: 100,
      height: 100,
      sizeBytes: 10,
      mimeType: 'image/jpeg',
    });

    useDiagnosisDraft.getState().setOwner('user-b');

    const state = useDiagnosisDraft.getState();
    expect(state.ownerId).toBe('user-b');
    expect(state.description).toBe('');
    expect(state.photos).toHaveLength(0);
  });

  it('keeps the draft when the same owner reopens the form', () => {
    useDiagnosisDraft.getState().setOwner('user-a');
    useDiagnosisDraft.getState().setDescription('Keep this draft');
    useDiagnosisDraft.getState().setOwner('user-a');

    expect(useDiagnosisDraft.getState().description).toBe('Keep this draft');
  });
});
