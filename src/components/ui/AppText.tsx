import { Text, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';

export type TextVariant = 'display' | 'title' | 'subtitle' | 'body' | 'caption' | 'label';

type AppTextProps = TextProps & {
  variant?: TextVariant;
  color?: string;
  weight?: TextStyle['fontWeight'];
  align?: TextStyle['textAlign'];
  uppercase?: boolean;
};

export function AppText({
  variant = 'body',
  color,
  weight,
  align,
  uppercase,
  style,
  children,
  ...rest
}: AppTextProps) {
  const { theme } = useTheme();
  const { isRTL } = useI18n();

  const sizes = theme.typography;
  const variants: Record<TextVariant, TextStyle> = {
    display: { fontSize: sizes.display, lineHeight: sizes.display * 1.16, fontWeight: '800' },
    title: { fontSize: sizes.title, lineHeight: sizes.title * 1.25, fontWeight: '700' },
    subtitle: { fontSize: sizes.subtitle, lineHeight: sizes.subtitle * 1.35, fontWeight: '600' },
    body: { fontSize: sizes.body, lineHeight: sizes.body * 1.55, fontWeight: '400' },
    caption: { fontSize: sizes.caption, lineHeight: sizes.caption * 1.5, fontWeight: '400' },
    label: { fontSize: sizes.label, lineHeight: sizes.label * 1.4, fontWeight: '600' },
  };

  return (
    <Text
      {...rest}
      style={[
        variants[variant],
        {
          color: color ?? theme.colors.text,
          writingDirection: isRTL ? 'rtl' : 'ltr',
          textAlign: align ?? (isRTL ? 'right' : 'left'),
          textTransform: uppercase ? 'uppercase' : undefined,
        },
        weight ? { fontWeight: weight } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}
