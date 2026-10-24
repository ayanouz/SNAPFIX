import { ar } from '@/i18n/ar';
import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';
import { translate } from '@/i18n';

describe('localization dictionaries', () => {
  it('keeps English, French, and Arabic keys in parity', () => {
    const englishKeys = Object.keys(en).sort();
    expect(Object.keys(fr).sort()).toEqual(englishKeys);
    expect(Object.keys(ar).sort()).toEqual(englishKeys);
  });

  it('interpolates named parameters', () => {
    const value = translate('en', 'subscription.usage_this_month', { used: 2, limit: 5 });
    expect(value).toContain('2');
    expect(value).toContain('5');
    expect(value).not.toContain('{used}');
  });

  it('falls back to English and then to the key itself', () => {
    expect(translate('fr', 'common.save')).not.toBe('common.save');
    expect(translate('en', 'missing.translation.key')).toBe('missing.translation.key');
  });

  it('contains translated safety escalation strings', () => {
    expect(translate('fr', 'safety.risk_critical')).not.toBe('safety.risk_critical');
    expect(translate('ar', 'safety.risk_critical')).not.toBe('safety.risk_critical');
  });
});
