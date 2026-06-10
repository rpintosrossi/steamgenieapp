import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBuildingStore } from '../../src/stores/building.store';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import { useAttendance } from '../../src/hooks/useAttendance';
import { SyncStatusBar } from '../../src/components/SyncStatusBar';
import { COLORS } from '../../src/constants/colors';

export default function FichajeScreen() {
  const { selectedBuilding, prefetchData, isLoadingPrefetch, refreshPrefetch } = useBuildingStore();
  const { isConnected } = useNetworkStatus();
  const isOnline = isConnected ?? true;

  const { activeAttendance, isLoading, error, checkIn, checkOut, clearError } = useAttendance(isOnline);

  const attendanceInThisBuilding =
    activeAttendance?.buildingId === selectedBuilding?.id ? activeAttendance : null;

  const checkInTime = attendanceInThisBuilding
    ? new Date(attendanceInThisBuilding.checkInAt).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <View style={styles.container}>
      <SyncStatusBar />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoadingPrefetch} onRefresh={refreshPrefetch} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Fichaje</Text>
          <Text style={styles.headerBuilding}>{selectedBuilding?.name ?? ''}</Text>
          {!isOnline && (
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineBadgeText}>Modo sin conexión</Text>
            </View>
          )}
        </View>

        {/* Status card */}
        <View style={[styles.statusCard, attendanceInThisBuilding ? styles.statusCardActive : styles.statusCardIdle]}>
          <Ionicons
            name={attendanceInThisBuilding ? 'checkmark-circle' : 'time-outline'}
            size={48}
            color={attendanceInThisBuilding ? COLORS.success : COLORS.disabled}
          />
          {attendanceInThisBuilding ? (
            <>
              <Text style={styles.statusTitle}>Fichado</Text>
              <Text style={styles.statusTime}>Entrada: {checkInTime}</Text>
              <Text style={styles.statusBldg}>{selectedBuilding?.name}</Text>
            </>
          ) : (
            <>
              <Text style={styles.statusTitleIdle}>Sin fichaje activo</Text>
              <Text style={styles.statusSubtitle}>Presioná "Fichar entrada" para comenzar</Text>
            </>
          )}
        </View>

        {/* Error */}
        {error && (
          <TouchableOpacity style={styles.errorBox} onPress={clearError}>
            <Ionicons name="alert-circle" size={18} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
          </TouchableOpacity>
        )}

        {/* GPS info */}
        {selectedBuilding?.latitude ? (
          <View style={styles.infoBox}>
            <Ionicons name="location-outline" size={14} color={COLORS.textMuted} />
            <Text style={styles.infoText}>
              Radio GPS: {selectedBuilding.gpsRadiusM}m — Tu ubicación se validará al fichar
            </Text>
          </View>
        ) : (
          <View style={[styles.infoBox, styles.infoBoxWarn]}>
            <Ionicons name="warning-outline" size={14} color={COLORS.warning} />
            <Text style={styles.infoText}>Este edificio no tiene GPS configurado</Text>
          </View>
        )}

        {/* Action buttons */}
        {!attendanceInThisBuilding ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary, isLoading && styles.actionBtnDisabled]}
            onPress={checkIn}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={22} color="#fff" />
                <Text style={styles.actionBtnText}>Fichar entrada</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger, isLoading && styles.actionBtnDisabled]}
            onPress={checkOut}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={22} color="#fff" />
                <Text style={styles.actionBtnText}>Fichar salida</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Active attendance in OTHER building */}
        {activeAttendance && !attendanceInThisBuilding && (
          <View style={[styles.infoBox, styles.infoBoxWarn]}>
            <Ionicons name="information-circle-outline" size={14} color={COLORS.warning} />
            <Text style={styles.infoText}>
              Tenés un fichaje activo en otro edificio. Al fichar aquí se cerrará automáticamente.
            </Text>
          </View>
        )}

        {/* Prefetch info */}
        {prefetchData && (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{prefetchData.workOrders.length}</Text>
              <Text style={styles.statLabel}>Servicios</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{prefetchData.rejectionReasons.length}</Text>
              <Text style={styles.statLabel}>Motivos</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 40 },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: COLORS.primary,
    gap: 2,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  headerBuilding: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  offlineBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.warning,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
    marginTop: 6,
  },
  offlineBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  statusCard: {
    margin: 16,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  statusCardActive: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' },
  statusCardIdle: { backgroundColor: COLORS.surface },
  statusTitle: { fontSize: 20, fontWeight: '700', color: COLORS.success },
  statusTitleIdle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  statusTime: { fontSize: 28, fontWeight: '800', color: COLORS.text },
  statusBldg: { fontSize: 14, color: COLORS.textMuted },
  statusSubtitle: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { flex: 1, color: COLORS.error, fontSize: 13 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
  },
  infoBoxWarn: { backgroundColor: '#fffbeb' },
  infoText: { flex: 1, color: COLORS.textMuted, fontSize: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    margin: 16,
    marginTop: 8,
    borderRadius: 12,
    padding: 16,
  },
  actionBtnPrimary: { backgroundColor: COLORS.primary },
  actionBtnDanger: { backgroundColor: COLORS.error },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '800', color: COLORS.primary },
  statLabel: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: COLORS.border },
});
