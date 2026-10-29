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
    <div className="home retro-home">
      {/* Saludo */}
      <div className="retro-home__welcome">
        <h1 className="retro-home__greeting">
          Hola{user?.name ? `, ${user.name}` : ''} 👋
        </h1>
        <p className="retro-home__connection">
          {online ? '🟢 Conectado con el servidor' : '🟠 Trabajando en modo local (sin conexión)'}
        </p>
      </div>

      {/* Widget de Estado de Turno / Caja */}
      {!cashLoading && (
        <div
          onClick={() => navigate('/caja')}
          className="retro-home__cash"
          style={{
            cursor: 'pointer',
            marginBottom: '24px',
            background: 'var(--surface)',
            border: `2px solid ${isCashOpen ? 'var(--success)' : 'var(--ocre)'}`,
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
      <h2 className="retro-home__section-title">
        Operaciones
      </h2>

      <div className="retro-home__grid">
        {/* Mostrador / Venta */}
        <div
          onClick={() => navigate('/venta')}
          className="retro-home__tile"
          style={{ cursor: 'pointer' }}
        >
          <img className="home-tile-illustration" src="/category-icons/porcion-pizza.svg" alt="" aria-hidden="true" />
          <strong className="retro-home__tile-title">Venta Mostrador</strong>
          <small className="retro-home__tile-subtitle">Para llevar & delivery</small>
        </div>

        {/* Salón */}
        <div
          onClick={() => navigate('/salon')}
          className="retro-home__tile"
          style={{ cursor: 'pointer' }}
        >
          <img className="home-tile-illustration" src="/category-icons/libreta.svg" alt="" aria-hidden="true" />
          <strong className="retro-home__tile-title">Cuentas y Comandas</strong>
          <small className="retro-home__tile-subtitle">Mesas y salón</small>
        </div>

        {/* Turno & Caja */}
        <div
          onClick={() => navigate('/caja')}
          className="retro-home__tile"
          style={{ cursor: 'pointer' }}
        >
          <img className="home-tile-illustration" src="/category-icons/caja-registradora.svg" alt="" aria-hidden="true" />
          <strong className="retro-home__tile-title">Turno & Caja</strong>
          <small className="retro-home__tile-subtitle">Apertura, arqueo y cierre</small>
        </div>

        {/* Cocina */}
        <div
          onClick={() => navigate('/cocina')}
          className="retro-home__tile"
          style={{ cursor: 'pointer' }}
        >
          <img className="home-tile-illustration" src="/category-icons/horno.svg" alt="" aria-hidden="true" />
          <strong className="retro-home__tile-title">Cocina</strong>
          <small className="retro-home__tile-subtitle">Monitor de pedidos</small>
        </div>
      </div>
    </div>
  );
}
