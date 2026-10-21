import { useCallback, useEffect, useState } from 'react';
import { Mail, Trash2 } from 'lucide-react';
import { adminMessage, deleteMessage, listMessages, markMessage } from '../adminApi';
import { EmptyState, PageHeader, useConfirm, useToast } from '../components';
import { Alert, Spinner } from '../../components/ui';
import { formatDateTimeShort } from '../../lib/datetime';
import { cx, telHref } from '../../lib/format';
import type { ContactMessage } from '../../types';

export function MessagesView() {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<ContactMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    listMessages()
      .then(setItems)
      .catch((e) => setError(adminMessage(e)));
  }, []);
  useEffect(load, [load]);

  async function toggle(m: ContactMessage) {
    setOpen(open === m.id ? null : m.id);
    if (!m.is_read) {
      try {
        await markMessage(m.id, true);
        setItems((x) => x?.map((y) => (y.id === m.id ? { ...y, is_read: true } : y)) ?? null);
      } catch {
        /* non-critical */
      }
    }
  }

  async function remove(m: ContactMessage) {
    if (!(await confirm({ title: 'Radera meddelandet?', body: 'Meddelandet tas bort permanent.', confirmLabel: 'Radera', danger: true }))) return;
    try {
      await deleteMessage(m.id);
      load();
    } catch (e) {
      toast('error', adminMessage(e));
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Meddelanden" sub="Från kontaktformuläret på webbplatsen." />
      {error && <Alert tone="error">{error}</Alert>}
      {items === null && !error && <Spinner label="Laddar meddelanden" />}
      {items?.length === 0 && <EmptyState title="Inga meddelanden" />}
      <ul className="space-y-2">
        {items?.map((m) => (
          <li key={m.id} className={cx('border bg-ink-900', m.is_read ? 'border-white/[0.07]' : 'border-white/30')}>
            <button type="button" aria-expanded={open === m.id} onClick={() => void toggle(m)} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left">
              <span className="min-w-0">
                <span className={cx('block truncate', !m.is_read && 'font-semibold')}>
                  {!m.is_read && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-white" aria-label="Oläst" />}
                  {m.name}
                </span>
                <span className="block truncate text-sm text-silver-400">{m.message}</span>
              </span>
              <span className="shrink-0 text-xs text-silver-500">{formatDateTimeShort(m.created_at)}</span>
            </button>
            {open === m.id && (
              <div className="border-t border-white/[0.07] px-4 py-4 text-sm">
                <p className="whitespace-pre-line text-silver-200">{m.message}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a className="btn btn-metal btn-sm" href={`mailto:${m.email}?subject=${encodeURIComponent('Svar från Crescor Bilvård')}`}>
                    <Mail className="h-3.5 w-3.5" aria-hidden /> Svara {m.email}
                  </a>
                  {m.phone && (
                    <a className="btn btn-ghost btn-sm" href={telHref(m.phone)}>
                      Ring {m.phone}
                    </a>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove(m)} aria-label="Radera meddelandet">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
