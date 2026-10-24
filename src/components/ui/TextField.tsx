import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { AppText } from './AppText';

type TextFieldProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
};

export function TextField({
  label,
  hint,
  error,
  required,
  style,
  multiline,
  ...rest
}: TextFieldProps) {
  const { theme } = useTheme();
  const { isRTL } = useI18n();
  const hasError = Boolean(error);

  return (
    <View style={styles.container}>
      {label ? (
        <AppText variant="label" color={theme.colors.text} style={styles.label}>
          {label}
          {required ? <AppText color={theme.colors.danger}> *</AppText> : null}
        </AppText>
      ) : null}
      <TextInput
        {...rest}
        multiline={multiline}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surface,
            borderColor: hasError ? theme.colors.danger : theme.colors.border,
            borderRadius: theme.radii.md,
            color: theme.colors.text,
            minHeight: multiline ? 110 : 50,
            paddingTop: multiline ? 12 : 0,
            textAlignVertical: multiline ? 'top' : 'center',
            writingDirection: isRTL ? 'rtl' : 'ltr',
            textAlign: isRTL ? 'right' : 'left',
          },
          style,
        ]}
      />
      {error ? (
        <AppText variant="caption" color={theme.colors.danger}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color={theme.colors.textMuted}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    marginBottom: 1,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
});
