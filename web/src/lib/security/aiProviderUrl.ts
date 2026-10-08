const isLoopbackHost = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "127.0.0.1" ||
    normalized.startsWith("127.")
  );
};

export const isAllowedAiProviderUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return false;
    return (
      (parsed.protocol === "https:" && Boolean(parsed.hostname)) ||
      (parsed.protocol === "http:" && isLoopbackHost(parsed.hostname))
    );
  } catch {
    return false;
  }
};
