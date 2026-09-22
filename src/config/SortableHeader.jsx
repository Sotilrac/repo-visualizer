/** A column heading that sorts the table it belongs to. */

/**
 * @param {{
 *   label: string,
 *   sortKey?: string,
 *   sort: { key: string, direction: 'asc' | 'desc' },
 *   onSort: (key: string) => void,
 *   className?: string,
 * }} props
 */
export function SortableHeader({ label, sortKey, sort, onSort, className }) {
  if (!sortKey) {
    return (
      <th scope="col" className={className}>
        {label}
      </th>
    );
  }

  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      className={className}
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="editor-sort" onClick={() => onSort(sortKey)}>
        {label}
        <span aria-hidden="true">{active ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}</span>
      </button>
    </th>
  );
}
