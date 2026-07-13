import { useAuth } from '@/lib/auth';
import { useOnline } from '@/lib/network';

export function HomePage() {
  const { user } = useAuth();
  const online = useOnline();

  return (
    <div className="home">
      <h1 className="home-hello">Hola{user?.name ? `, ${user.name}` : ''}</h1>
      <p className="home-sub">{online ? 'Listo para operar.' : 'Trabajando sin conexión.'}</p>

      <div className="home-grid">
        <div className="home-tile home-tile--soon">
          Venta de mostrador
          <small>Próximamente</small>
        </div>
        <div className="home-tile home-tile--soon">
          Salón
          <small>Próximamente</small>
        </div>
        <div className="home-tile home-tile--soon">
          Cocina
          <small>Próximamente</small>
        </div>
      </div>
    </div>
  );
}
