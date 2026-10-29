import { categoryIconSrc } from './categoryIconMap';

interface CategoryIconProps {
  name?: string | null;
  productName?: string | null;
  size?: number;
  className?: string;
}

export function CategoryIcon({ name, productName, size = 28, className }: CategoryIconProps) {
  return (
    <img
      className={className}
      src={categoryIconSrc(name, productName)}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      loading="eager"
      draggable={false}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
