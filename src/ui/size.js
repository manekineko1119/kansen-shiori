// 画面の幅の区分（S・M・L）を html の data-size に入れ、変わったら onChange を呼ぶ（設計書 3.5）
import { sizeClass, MEDIA } from '../core/layout.js';

export function watchSize(onChange) {
  const update = () => { document.documentElement.dataset.size = sizeClass(window.innerWidth); };
  update();
  for (const query of Object.values(MEDIA)) matchMedia(query).addEventListener('change', () => { update(); onChange(); });
}
