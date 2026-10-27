import { useTheme, type ThemeChoice } from './ThemeProvider';

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Sistema' },
];

export function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  return (
    <fieldset className="theme-toggle">
      <legend className="theme-toggle__legend">Apariencia</legend>
      <div className="theme-toggle__options" role="group" aria-label="Tema de la aplicación">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`theme-toggle__option${choice === option.value ? ' is-active' : ''}`}
            aria-pressed={choice === option.value}
            onClick={() => setChoice(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
