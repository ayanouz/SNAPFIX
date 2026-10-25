import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DiagnosisAnalysis } from '@/domain/diagnosis/schema';
import { safetyEscalationCode } from '@/domain/diagnosis/safety';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { AppText } from './AppText';

type SafetyBannerProps = {
  safety: DiagnosisAnalysis['safety'];
  compact?: boolean;
};

export function SafetyBanner({ safety, compact = false }: SafetyBannerProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const level = safety.risk_level;
  const palette = {
    low: {
      fg: theme.colors.success,
      bg: theme.colors.successSoft,
      icon: 'shield-checkmark-outline',
    },
    medium: { fg: theme.colors.warning, bg: theme.colors.warningSoft, icon: 'warning-outline' },
    high: { fg: theme.colors.danger, bg: theme.colors.dangerSoft, icon: 'alert-circle-outline' },
    critical: { fg: theme.colors.critical, bg: theme.colors.criticalSoft, icon: 'skull-outline' },
  } as const;
  const colors = palette[level];
  const escalationCode = safetyEscalationCode(safety);
  const escalationText = escalationCode
    ? t(`safety.escalations.${escalationCode}`)
    : safety.escalation;

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.container,
        {
          backgroundColor: colors.bg,
          borderColor: colors.fg,
          borderRadius: theme.radii.lg,
          padding: compact ? theme.spacing.md : theme.spacing.lg,
        },
      ]}
    >
      <View style={styles.header}>
        <Ionicons name={colors.icon} size={24} color={colors.fg} />
        <View style={styles.flex}>
          <AppText variant="subtitle" color={colors.fg}>
            {t(`safety.risk_${level}`)}
          </AppText>
          {safety.stop_guidance ? (
            <AppText variant="label" color={colors.fg}>
              {t('safety.stop_guidance')}
            </AppText>
          ) : safety.professional_required ? (
            <AppText variant="label" color={colors.fg}>
              {t('safety.professional_required')}
            </AppText>
          ) : null}
        </View>
      </View>

      {safety.warnings.length > 0 ? (
        <View style={styles.warnings}>
          {safety.warnings.map((warning, index) => (
            <View key={`${warning.code}-${index}`} style={styles.warningRow}>
              <View style={[styles.dot, { backgroundColor: colors.fg }]} />
              <View style={styles.flex}>
                <AppText variant="label" color={theme.colors.text}>
                  {t(`safety.warnings.${warning.code}`)}
                </AppText>
                <AppText variant="caption" color={theme.colors.textMuted}>
                  {warning.source === 'rule'
                    ? t(`safety.warning_bodies.${warning.code}`)
                    : warning.message}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {escalationText ? (
        <View style={[styles.escalation, { borderTopColor: colors.fg }]}>
          <AppText variant="label" color={colors.fg}>
            {t('diagnosis.escalation')}
          </AppText>
          <AppText variant="body" color={theme.colors.text}>
            {escalationText}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  flex: { flex: 1, gap: 3 },
  warnings: { gap: 10 },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  escalation: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 4,
  },
});
