export const parseOrderServiceDateTime = (
  value?: string | null,
): Date | null => {
  if (!value) return null;

  const normalized = String(value).replace(' ', 'T');
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

export const formatOrderServiceTime = (
  value?: string | null,
): string | null => {
  const date = parseOrderServiceDateTime(value);

  if (!date) {
    return null;
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};
