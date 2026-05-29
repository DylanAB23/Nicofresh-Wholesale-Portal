const configs: Record<string, { bg: string; text: string; label: string }> = {
  pending:         { bg: 'bg-amber-50',    text: 'text-amber-700',    label: 'Pending' },
  approved:        { bg: 'bg-brand-50',    text: 'text-brand-700',    label: 'Approved' },
  processing:      { bg: 'bg-blue-50',     text: 'text-blue-700',     label: 'Processing' },
  shipped:         { bg: 'bg-brand-100',   text: 'text-brand-800',    label: 'Shipped' },
  delivered:       { bg: 'bg-emerald-50',  text: 'text-emerald-700',  label: 'Delivered' },
  cancelled:       { bg: 'bg-red-50',      text: 'text-red-700',      label: 'Cancelled' },
  unpaid:          { bg: 'bg-amber-50',    text: 'text-amber-700',    label: 'Unpaid' },
  pending_payment: { bg: 'bg-amber-50',    text: 'text-amber-700',    label: 'Awaiting Payment' },
  paid:            { bg: 'bg-emerald-50',  text: 'text-emerald-700',  label: 'Paid' },
  overdue:         { bg: 'bg-red-50',      text: 'text-red-700',      label: 'Overdue' },
  partial:         { bg: 'bg-blue-50',     text: 'text-blue-700',     label: 'Partial' },
  active:          { bg: 'bg-emerald-50',  text: 'text-emerald-700',  label: 'Active' },
  suspended:       { bg: 'bg-red-50',      text: 'text-red-700',      label: 'Suspended' },
};

export default function StatusBadge({ status }: { status: string }) {
  const cfg = configs[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: status };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}
