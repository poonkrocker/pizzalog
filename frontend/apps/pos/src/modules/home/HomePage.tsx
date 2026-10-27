import { useNavigate } from 'react-router-dom';
import { formatARS } from '@pizzalog/shared';
import { useAuth } from '@/lib/auth';
import { useOnline } from '@/lib/network';
import { useCurrentCashSession } from '@/modules/cash/hooks';

export function HomePage() {
  const { user } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();
  const { data: cashSession, isLoading: cashLoading } = useCurrentCashSession();

  const isCashOpen = Boolean(cashSession && cashSession.status === 'open');

  return (
    <div className="home" style={{ padding: '20px 16px', maxWidth: '640px', margin: '0 auto' }}>
      {/* Saludo */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--text)' }}>
          Hola{user?.name ? `, ${user.name}` : ''} 👋
        </h1>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted)' }}>
          {online ? '🟢 Conectado con el servidor' : '🟠 Trabajando en modo local (sin conexión)'}
        </p>
      </div>

      {/* Widget de Estado de Turno / Caja */}
      {!cashLoading && (
        <div
          onClick={() => navigate('/caja')}
          style={{
            cursor: 'pointer',
            borderRadius: '16px',
            padding: '16px 18px',
            marginBottom: '24px',
            background: isCashOpen
              ? 'linear-gradient(135deg, rgba(108, 192, 112, 0.15) 0%, rgba(42, 38, 37, 1) 100%)'
              : 'linear-gradient(135deg, rgba(253, 183, 64, 0.18) 0%, rgba(42, 38, 37, 1) 100%)',
            border: `1px solid ${isCashOpen ? 'var(--success)' : 'var(--ocre)'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: isCashOpen ? 'var(--success)' : 'var(--ocre)', marginBottom: '4px' }}>
              {isCashOpen ? `🟢 Turno Activo #${cashSession?.id}` : '🟡 Caja Cerrada'}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
              {isCashOpen
                ? `Efectivo: ${formatARS(cashSession?.expected_amount ?? cashSession?.opening_amount ?? 0)}`
                : 'Abrir turno para operar'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
              {isCashOpen
                ? `Abierto a las ${new Date(cashSession!.opened_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
                : 'Tocá acá para ingresar el fondo inicial'}
            </div>
          </div>
          <button
            type="button"
            className="t-btn"
            style={{
              padding: '0 14px',
              minHeight: '38px',
              fontSize: '13px',
              background: isCashOpen ? 'var(--surface-2)' : 'var(--ocre)',
              color: isCashOpen ? 'var(--text)' : '#000',
              fontWeight: 700,
            }}
          >
            {isCashOpen ? 'Ver Caja ›' : 'Abrir ›'}
          </button>
        </div>
      )}

      {/* Menú de Módulos */}
      <h2 style={{ fontSize: '15px', textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.5px', margin: '0 0 12px 0' }}>
        Operaciones
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {/* Mostrador / Venta */}
        <div
          onClick={() => navigate('/venta')}
          style={{
            cursor: 'pointer',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: '16px',
            padding: '20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '32px' }}>🍕</span>
          <strong style={{ fontSize: '16px', color: 'var(--text)' }}>Venta Mostrador</strong>
          <small style={{ color: 'var(--muted)', fontSize: '12px' }}>Para llevar & delivery</small>
        </div>

        {/* Salón */}
        <div
          onClick={() => navigate('/salon')}
          style={{
            cursor: 'pointer',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: '16px',
            padding: '20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '32px' }}>🍽️</span>
          <strong style={{ fontSize: '16px', color: 'var(--text)' }}>Cuentas y Comandas</strong>
          <small style={{ color: 'var(--muted)', fontSize: '12px' }}>Mesas y salón</small>
        </div>

        {/* Turno & Caja */}
        <div
          onClick={() => navigate('/caja')}
          style={{
            cursor: 'pointer',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: '16px',
            padding: '20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '32px' }}>💵</span>
          <strong style={{ fontSize: '16px', color: 'var(--text)' }}>Turno & Caja</strong>
          <small style={{ color: 'var(--muted)', fontSize: '12px' }}>Apertura, arqueo y cierre</small>
        </div>

        {/* Cocina */}
        <div
          onClick={() => navigate('/cocina')}
          style={{
            cursor: 'pointer',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: '16px',
            padding: '20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '32px' }}>♨️</span>
          <strong style={{ fontSize: '16px', color: 'var(--text)' }}>Cocina</strong>
          <small style={{ color: 'var(--muted)', fontSize: '12px' }}>Monitor de pedidos</small>
        </div>
      </div>
    </div>
  );
}
