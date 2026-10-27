import type { SVGProps } from 'react';

export function IconInicio(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="22"
      height="22"
      {...props}
    >
      <path d="M3.8 5.2 20.2 5.2 12 20.5Z" />
      <circle cx="9" cy="9" r=".85" />
      <circle cx="15.2" cy="9.2" r=".85" />
      <circle cx="12" cy="13.2" r=".85" />
    </svg>
  );
}

export function IconTurno({
  isOpen,
  ...props
}: SVGProps<SVGSVGElement> & { isOpen: boolean }) {
  if (isOpen) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#789B69"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="22"
        height="22"
        {...props}
      >
        <path d="M5 8.5 12 2.8l7 5.7" />
        <circle cx="12" cy="2.8" r=".65" fill="#789B69" stroke="none" />
        <rect x="3.8" y="8.5" width="16.4" height="11.3" rx="1.4" />
        <text
          x="12"
          y="15.7"
          fill="#789B69"
          stroke="none"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="5.1"
          fontWeight="600"
          textAnchor="middle"
        >
          OPEN
        </text>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#B95B56"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="22"
      height="22"
      {...props}
    >
      <path d="M5 8.5 12 2.8l7 5.7" />
      <circle cx="12" cy="2.8" r=".65" fill="#B95B56" stroke="none" />
      <rect x="3.8" y="8.5" width="16.4" height="11.3" rx="1.4" />
      <text
        x="12"
        y="15.7"
        fill="#B95B56"
        stroke="none"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="4.15"
        fontWeight="600"
        textAnchor="middle"
      >
        CLOSED
      </text>
    </svg>
  );
}

export function IconVenta(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="22"
      height="22"
      {...props}
    >
      <path d="M15.8 5.4c-1-1-2.2-1.5-3.8-1.5-2.2 0-3.8 1.2-3.8 3 0 4.8 7.6 2.4 7.6 7.2 0 1.9-1.7 3.2-4 3.2-1.6 0-3.1-.6-4.2-1.7" />
      <path d="M12 1.8v20.4" />
    </svg>
  );
}

export function IconCuentas(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="22"
      height="22"
      {...props}
    >
      <path d="M3 4.8h6.2c1.4 0 2.4.8 2.8 1.8.4-1 1.4-1.8 2.8-1.8H21v14.5h-6.2c-1.4 0-2.4.5-2.8 1.2-.4-.7-1.4-1.2-2.8-1.2H3Z" />
      <path d="M12 6.6v13.9M5.5 8h3.1M5.5 11.2h3.1M5.5 14.4h3.1M15.4 8h3.1M15.4 11.2h3.1M15.4 14.4h3.1" />
    </svg>
  );
}

export function IconCocina(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="22"
      height="22"
      {...props}
    >
      <path d="M6.4 15.2c2.1-2.2-1.1-3.8 1-6.2 1-1.1 1.2-2.1 1.1-3.2M11.8 15.2c2.1-2.2-1.1-3.8 1-6.2 1-1.1 1.2-2.1 1.1-3.2M17.2 15.2c2.1-2.2-1.1-3.8 1-6.2 1-1.1 1.2-2.1 1.1-3.2" />
      <path d="M3.5 19.5h17" />
    </svg>
  );
}

export function IconAjustes(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="22"
      height="22"
      {...props}
    >
      <path
        d="m10 2.8.6-1h2.8l.6 1 .2 1.8 1.5.9 1.7-.6 1.9 1.9-.6 1.7.9 1.5 1.8.2v2.8l-1.8.6-.9 1.5.6 1.7-1.9 1.9-1.7-.6-1.5.9-.2 1.8h-2.8l-.6-1.8-1.5-.9-1.7.6-1.9-1.9.6-1.7-.9-1.5-1.8-.6v-2.8l1.8-.2.9-1.5-.6-1.7 1.9-1.9 1.7.6 1.5-.9Z"
        transform="translate(1 1) scale(.92)"
      />
      <circle cx="12" cy="12" r="3.1" />
    </svg>
  );
}
