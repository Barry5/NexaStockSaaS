export function formatCurrency(
  val: number,
  currency: string = 'EUR',
  maximumFractionDigits: number = 2
): string {
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency.toUpperCase().trim(),
      maximumFractionDigits
    }).format(val);
  } catch {
    return `${val.toLocaleString('fr-FR', { minimumFractionDigits: maximumFractionDigits, maximumFractionDigits })} ${currency}`;
  }
}

export function formatDate(dateStr: string, locale: string = 'fr-FR'): string {
  return new Date(dateStr).toLocaleDateString(locale);
}

export function formatDateTime(dateStr: string, locale: string = 'fr-FR'): string {
  return new Date(dateStr).toLocaleString(locale);
}

export function formatTime(dateStr: string, locale: string = 'fr-FR'): string {
  return new Date(dateStr).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export function generateId(prefix: string = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export function generateInvoiceNumber(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  const r = Math.floor(Math.random() * 9000 + 1000);
  return `FACT-${y}${m}${d}-${r}`;
}
