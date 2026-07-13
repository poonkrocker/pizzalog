import { Fragment, useState, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
}

export function DataTable<T extends { id: number }>({
  columns,
  rows,
  renderExpand,
}: {
  columns: Column<T>[];
  rows: T[];
  /** Si devuelve contenido para una fila, esa fila se puede desplegar. */
  renderExpand?: (row: T) => ReactNode | null;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const hasExpand = Boolean(renderExpand);

  function toggle(id: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: c.align ?? 'left', width: c.width }}>
                {c.header}
              </th>
            ))}
            {hasExpand && <th className="table__exp-h" aria-hidden="true" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const extra = hasExpand ? renderExpand!(row) : null;
            const isOpen = open.has(row.id);
            return (
              <Fragment key={row.id}>
                <tr className={extra && isOpen ? 'is-open' : undefined}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      data-label={c.header || undefined}
                      style={{ textAlign: c.align ?? 'left' }}
                    >
                      {c.render ? c.render(row) : (row as Record<string, ReactNode>)[c.key]}
                    </td>
                  ))}
                  {hasExpand && (
                    <td className="table__exp">
                      {extra ? (
                        <button
                          className="exp-btn"
                          onClick={() => toggle(row.id)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Ocultar' : 'Desplegar'}
                        >
                          {isOpen ? '▾' : '▸'}
                        </button>
                      ) : null}
                    </td>
                  )}
                </tr>
                {extra && isOpen && (
                  <tr className="table__expand">
                    <td colSpan={columns.length + (hasExpand ? 1 : 0)}>{extra}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
