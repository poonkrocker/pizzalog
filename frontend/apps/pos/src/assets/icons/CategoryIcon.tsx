import { categoryIconSrc } from './categoryIconMap';

interface CategoryIconProps {
  name?: string | null;
  size?: number;
  className?: string;
}

export function CategoryIcon({ name, size = 28, className }: CategoryIconProps) {
  return (
    <img
      className={className}
      src={categoryIconSrc(name)}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      loading="eager"
      draggable={false}
    />
  );
}
