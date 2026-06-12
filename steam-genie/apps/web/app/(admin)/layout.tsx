import { AuthGuard } from '../../components/AuthGuard';
import { AdminShell } from '../../components/AdminShell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AdminShell>{children}</AdminShell>
    </AuthGuard>
  );
}
