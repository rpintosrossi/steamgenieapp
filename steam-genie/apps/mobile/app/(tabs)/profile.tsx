import { View, Text } from 'react-native';
import { useAuthStore } from '../../src/stores/auth.store';
import { Button } from 'react-native';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <Text>{user?.fullName ?? 'Usuario'}</Text>
      <Text>{user?.dni}</Text>
      <Button title="Cerrar sesión" onPress={logout} />
    </View>
  );
}
