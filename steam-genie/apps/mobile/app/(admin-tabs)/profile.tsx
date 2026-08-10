import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useAuthStore } from '../../src/stores/auth.store';
import { COLORS } from '../../src/constants/colors';
import { BrandedScreenHeader } from '../../src/components/BrandedScreenHeader';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Encargado',
  cleaner: 'Limpiador',
  stock: 'Stock',
};

export default function AdminProfileScreen() {
  const { user, logout } = useAuthStore();

  async function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Confirmas que querés cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrandedScreenHeader title="Mi perfil" subtitle={user?.fullName ?? undefined} />

      <View style={styles.card}>
        <Text style={styles.label}>Nombre</Text>
        <Text style={styles.value}>{user?.fullName ?? '—'}</Text>
        <Text style={styles.label}>DNI</Text>
        <Text style={styles.value}>{user?.dni ?? '—'}</Text>
        <Text style={styles.label}>Rol</Text>
        <Text style={styles.value}>
          {ROLE_LABELS[user?.primaryRole ?? ''] ?? user?.primaryRole ?? '—'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Panel administrador</Text>
        <Text style={styles.hint}>
          Estás en el modo consulta de la app: calendario de servicios, insumos y
          presencia. Para fichaje operativo usá una cuenta de limpiador o encargado.
        </Text>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 40 },
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
  hint: { fontSize: 13, color: COLORS.textMuted, lineHeight: 18 },
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
