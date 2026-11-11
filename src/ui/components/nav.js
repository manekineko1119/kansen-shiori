// メニュー：S・M は画面下のタブ、L は左のメニュー（見た目は CSS で切り替える。設計書 3.5）

const SVG = (body) =>
  `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  search: SVG('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
  calendar: SVG('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  trips: SVG('<path d="M4 19h16M6 15l2-9h8l2 9M9 6V4h6v2"/>'),
  records: SVG('<path d="M5 3h11l3 3v15H5z"/><path d="M9 10h6M9 14h6M9 18h3"/>'),
  // 歯車：輪と、外側の8つの歯（太い短い線）と、中心の穴
  settings: SVG('<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2.5"/><path stroke-width="3.4" stroke-linecap="butt" d="M12 2.2v3.6M12 18.2v3.6M2.2 12h3.6M18.2 12h3.6M5.1 5.1l2.5 2.5M16.4 16.4l2.5 2.5M5.1 18.9l2.5-2.5M16.4 7.6l2.5-2.5"/>'),
};

export const NAV_ITEMS = [
  { key: 'search', label: '検索', href: '#/search' },
  { key: 'calendar', label: 'カレンダー', href: '#/calendar' },
  { key: 'trips', label: '遠征予定', href: '#/trips' },
  { key: 'records', label: '記録', href: '#/records' },
];

// 画面の名前から、メニューのどれを選択中にするか（なければ null）
export function navKeyOf(routeName) {
  return {
    search: 'search', result: 'search', calendar: 'calendar', trips: 'trips', trip: 'trips', 'trip-new': 'trips',
    records: 'records', record: 'records', settings: 'settings',
  }[routeName] ?? null;
}

function link({ key, label, href }, current, cls = '') {
  const a = document.createElement('a');
  a.href = href;
  a.className = cls;
  if (key === current) a.setAttribute('aria-current', 'page');
  a.innerHTML = `${ICONS[key]}<span></span>`;
  a.querySelector('span').textContent = label;
  return a;
}

export function renderNav(current) {
  const nav = document.createElement('nav');
  nav.className = 'menu';
  nav.setAttribute('aria-label', 'メニュー');
  const brand = document.createElement('div');
  brand.className = 'menu-brand';
  brand.innerHTML = '<img src="./icons/icon.svg" alt="" width="34" height="34"><span>観戦のしおり</span>';
  nav.append(brand);
  for (const item of NAV_ITEMS) nav.append(link(item, current));
  // 設定は L だけ左のメニューの5つ目（S・M は右上のボタン）
  nav.append(link({ key: 'settings', label: '設定', href: '#/settings' }, current, 'menu-settings'));
  return nav;
}
