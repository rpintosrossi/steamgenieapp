import { View, Text, StyleSheet } from 'react-native';
import { useSyncStore } from '../stores/sync.store';
import { COLORS } from '../constants/colors';

const STATUS_CONFIG = {
  synced: { color: COLORS.success, label: 'Sincronizado' },
  pending: { color: COLORS.warning, label: 'Pendiente de sincronizar' },
  offline: { color: COLORS.error, label: 'Sin conexión' },
  syncing: { color: COLORS.primary, label: 'Sincronizando...' },
  error: { color: COLORS.error, label: 'Error de sincronización' },
};

export function SyncStatusBar() {
  const { status, pendingCount } = useSyncStore();
  const config = STATUS_CONFIG[status];

  if (status === 'synced') return null;

  const label =
    status === 'pending' && pendingCount > 0
      ? `${config.label} (${pendingCount})`
      : config.label;

  return (
    <View style={[styles.bar, { backgroundColor: config.color }]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical: 4,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
