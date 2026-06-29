import { useAuth } from '@/lib/auth';

export function DashboardPage() {
  const { user } = useAuth();
  return (
    <section>
      <p className="eyebrow">Resumen</p>
      <h1 className="page-title">Hola, {user?.name}</h1>
      <p className="page-lead">
        Este es el panel de Pizzalog. A medida que sumemos m&oacute;dulos, los
        vas a ver aparecer en el men&uacute; seg&uacute;n tu rol.
      </p>
    </section>
  );
}
