const PATHS: Record<string, string> = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  tasks: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12l3 3 5-6"/>',
  board: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18"/>',
  clients: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c1.8.7 3 2.5 3.5 5.2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  review: '<path d="M4 5h16v11H9l-5 4z"/><path d="M9 10.5l2 2 4-4"/>',
  reports: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  spark: '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V4H3v13h5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
  insta: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  poster: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="9.5" cy="9" r="1.8"/><path d="M4 17l5-5 4 4 2-2 5 5"/>',
  reel: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 8h18M8 3l2 5M14 3l2 5M10 12v5l4-2.5z"/>',
  creative_reel: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 8h18M8 3l2 5M14 3l2 5M10 12v5l4-2.5z"/><path d="M19 3v4M21 5h-4"/>',
  carousel: '<rect x="7" y="4" width="10" height="16" rx="2"/><path d="M4 7v10M20 7v10"/>',
  story: '<circle cx="12" cy="12" r="9" stroke-dasharray="3 2.2"/><circle cx="12" cy="12" r="4"/>',
  presentation_video: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M10 7.5l5 2.5-5 2.5z"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  other: '<circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
  checkc: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  link: '<path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.2-6.5 8-6.5s7 2 8 6.5"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
};

export function Icon({ name, size = 17 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: PATHS[name] ?? '' }} />
  );
}

/** The Cue by CreativHeads wordmark (public/cue-logo.png, 842x256). */
export function Logo({ height = 34 }: { height?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/cue-logo.png" alt="Cue by CreativHeads" height={height} width={Math.round((height * 842) / 256)} style={{ display: 'block' }} />;
}
