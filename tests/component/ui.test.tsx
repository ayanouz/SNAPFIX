import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AppThemeProvider } from '@/providers/ThemeProvider';
import { I18nProvider, translate } from '@/i18n';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SafetyBanner } from '@/components/ui/SafetyBanner';

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <AppThemeProvider>
      <I18nProvider>{children}</I18nProvider>
    </AppThemeProvider>
  );
}

describe('UI primitives', () => {
  it('renders a badge with its label', async () => {
    await render(<Badge label="Demo mode" tone="warning" />, { wrapper: Wrapper });
    expect(screen.getByText('Demo mode')).toBeTruthy();
  });

  it('fires the button callback and blocks disabled presses', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<Button label="Continue" onPress={onPress} />, {
      wrapper: Wrapper,
    });

    await fireEvent.press(screen.getByText('Continue'));
    expect(onPress).toHaveBeenCalledTimes(1);

    await rerender(<Button label="Continue" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByText('Continue'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders critical safety warnings and escalation', async () => {
    await render(
      <SafetyBanner
        safety={{
          risk_level: 'critical',
          professional_required: true,
          stop_guidance: true,
          warnings: [
            {
              code: 'gas_leak',
              severity: 'critical',
              message: 'Possible gas leak. Leave the area.',
              source: 'rule',
            },
          ],
          escalation: 'Call the gas emergency service.',
        }}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText(translate('en', 'safety.risk_critical'))).toBeTruthy();
    expect(screen.getByText(translate('en', 'safety.stop_guidance'))).toBeTruthy();
    expect(screen.getByText(translate('en', 'safety.warnings.gas_leak'))).toBeTruthy();
    expect(screen.getByText(translate('en', 'safety.warning_bodies.gas_leak'))).toBeTruthy();
    expect(screen.getByText(translate('en', 'safety.escalations.gas_leak'))).toBeTruthy();
  });

  it('keeps model-sourced warning text instead of replacing it with rule copy', async () => {
    await render(
      <SafetyBanner
        safety={{
          risk_level: 'low',
          professional_required: false,
          stop_guidance: false,
          warnings: [
            {
              code: 'uncertain_evidence',
              severity: 'low',
              message: 'Model-specific limitation.',
              source: 'model',
            },
          ],
          escalation: null,
        }}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('Model-specific limitation.')).toBeTruthy();
  });
});
