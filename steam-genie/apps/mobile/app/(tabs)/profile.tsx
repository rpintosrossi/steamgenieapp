import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useAuthStore } from '../../src/stores/auth.store';
import { useBuildingStore } from '../../src/stores/building.store';
import { useSyncStore } from '../../src/stores/sync.store';
import { syncManager } from '../../src/sync/sync-manager';
import { COLORS } from '../../src/constants/colors';

const STATUS_LABELS: Record<string, string> = {
  synced: 'Sincronizado',
  pending: 'Pendiente',
  offline: 'Sin conexión',
  syncing: 'Sincronizando...',
  error: 'Error',
};

const STATUS_COLORS: Record<string, string> = {
  synced: COLORS.success,
  pending: COLORS.warning,
  offline: COLORS.error,
  syncing: COLORS.primary,
  error: COLORS.error,
};

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const { selectedBuilding, clearBuilding } = useBuildingStore();
  const { status, pendingCount, lastSyncedAt, errorMessage } = useSyncStore();
  const accessToken = useAuthStore((s) => s.accessToken);

  async function handleSync() {
    if (!accessToken) return;
    await syncManager.syncAll(accessToken);
  }

  async function handleChangeBuilding() {
    Alert.alert(
      'Cambiar edificio',
      '¿Querés seleccionar otro edificio? Se cerrará la sesión del edificio actual.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cambiar',
          onPress: async () => {
            await clearBuilding();
            // Navigation handled by _layout.tsx guard
          },
        },
      ],
    );
  }

  async function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Confirmas que querés cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          await clearBuilding();
          await logout();
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Perfil</Text>
      </View>

      {/* User info */}
      <View style={styles.card}>
        <Text style={styles.label}>Nombre</Text>
        <Text style={styles.value}>{user?.fullName ?? '—'}</Text>
        <Text style={styles.label}>DNI</Text>
        <Text style={styles.value}>{user?.dni ?? '—'}</Text>
        <Text style={styles.label}>Rol</Text>
        <Text style={styles.value}>{user?.primaryRole ?? '—'}</Text>
      </View>

      {/* Building */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Edificio actual</Text>
        <Text style={styles.value}>{selectedBuilding?.name ?? 'Sin seleccionar'}</Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={handleChangeBuilding}>
          <Text style={styles.secondaryBtnText}>Cambiar edificio</Text>
        </TouchableOpacity>
      </View>

      {/* Sync status */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Sincronización</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status] }]} />
          <Text style={styles.statusText}>
            {STATUS_LABELS[status]}
            {status === 'pending' && pendingCount > 0 ? ` (${pendingCount} pendientes)` : ''}
          </Text>
        </View>
        {lastSyncedAt && (
          <Text style={styles.label}>
            Última sincronización: {new Date(lastSyncedAt).toLocaleTimeString('es-AR')}
          </Text>
        )}
        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        <TouchableOpacity style={styles.secondaryBtn} onPress={handleSync}>
          <Text style={styles.secondaryBtnText}>Sincronizar ahora</Text>
        </TouchableOpacity>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 40 },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: COLORS.primary,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  card: {
    backgroundColor: COLORS.surface,
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    gap: 4,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  label: { fontSize: 12, color: COLORS.textMuted, marginTop: 8 },
  value: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 14, color: COLORS.text },
  errorText: { fontSize: 12, color: COLORS.error, marginTop: 4 },
  secondaryBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  secondaryBtnText: { color: COLORS.primary, fontWeight: '600', fontSize: 14 },
  logoutBtn: {
    margin: 16,
    marginTop: 24,
    backgroundColor: COLORS.error,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  logoutText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
