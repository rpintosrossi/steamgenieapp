import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import {
  CheckoutReservationInfo,
  WorkOrderLocationRefs,
  formatReservationDateTime,
  formatReservationLocation,
  getReservationStatusLabel,
} from '../utils/reservation-info';

interface CheckoutReservationCardProps {
  reservation: CheckoutReservationInfo;
  workOrderLocation?: WorkOrderLocationRefs;
  compact?: boolean;
}

export function CheckoutReservationCard({
  reservation,
  workOrderLocation,
  compact = false,
}: CheckoutReservationCardProps) {
  const location = formatReservationLocation(reservation, workOrderLocation);

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.titleRow}>
        <Ionicons name="bed-outline" size={18} color={COLORS.primary} />
        <Text style={styles.title}>Datos de la reserva</Text>
      </View>

      <Text style={styles.label}>Huésped</Text>
      <Text style={styles.value}>{reservation.guestName?.trim() || 'Sin nombre'}</Text>

      <Text style={styles.label}>Ubicación</Text>
      <Text style={styles.value}>{location}</Text>

      <Text style={styles.label}>Check-in</Text>
      <Text style={styles.value}>{formatReservationDateTime(reservation.checkinAt)}</Text>

      <Text style={styles.label}>Check-out</Text>
      <Text style={styles.value}>{formatReservationDateTime(reservation.checkoutAt)}</Text>

      {reservation.externalId ? (
        <>
          <Text style={styles.label}>Referencia</Text>
          <Text style={styles.value}>{reservation.externalId}</Text>
        </>
      ) : null}

      {reservation.status ? (
        <>
          <Text style={styles.label}>Estado de la reserva</Text>
          <Text style={styles.value}>{getReservationStatusLabel(reservation.status)}</Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  cardCompact: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  label: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 8,
  },
  value: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
});
