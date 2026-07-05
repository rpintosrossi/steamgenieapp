import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/constants/colors';

type IoniconsName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, color }: { name: IoniconsName; color: string }) {
  return <Ionicons name={name} size={24} color={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.disabled,
        tabBarStyle: { backgroundColor: COLORS.surface, borderTopColor: COLORS.border },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Fichaje',
          tabBarIcon: ({ color }) => <TabIcon name="time-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: 'Servicios',
          tabBarIcon: ({ color }) => <TabIcon name="clipboard-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tareas"
        options={{
          title: 'Tareas',
          tabBarIcon: ({ color }) => <TabIcon name="checkbox-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="edificio"
        options={{
          title: 'Edificio',
          tabBarIcon: ({ color }) => <TabIcon name="business-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: 'Insumos',
          tabBarIcon: ({ color }) => <TabIcon name="cube-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <TabIcon name="person-outline" color={color} />,
        }}
      />
    </Tabs>
  );
}
