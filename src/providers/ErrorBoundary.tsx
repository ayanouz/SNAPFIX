import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/i18n';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

function CrashFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();

  return (
    <View style={styles.fallback}>
      <View style={styles.copy}>
        <Text style={styles.title}>{t('common.error')}</Text>
        <Text style={styles.body}>{t('errors.unknown')}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
      >
        <Text style={styles.buttonText}>{t('common.retry')}</Text>
      </Pressable>
    </View>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    // Keep a compact breadcrumb in the console while avoiding exposing raw
    // internals to the user. Production crash reporting can hook in here later.
    console.error('SNAPFIX render error', error, info.componentStack);
  }

  private retry = () => {
    this.setState({ hasError: false });
  };

  override render() {
    if (this.state.hasError) return <CrashFallback onRetry={this.retry} />;
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 32,
    backgroundColor: '#FFFFFF',
  },
  copy: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0B1220',
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#5C6778',
    textAlign: 'center',
  },
  button: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: '#0B1220',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
