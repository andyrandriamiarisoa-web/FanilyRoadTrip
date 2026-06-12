"use client";

export function ThemeScript() {
  const script = `
    try {
      const t = localStorage.getItem('odyssee-theme');
      if (t === 'light') document.documentElement.classList.add('light');
    } catch(e) {}
  `;
  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
