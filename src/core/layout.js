// 画面の幅の3段階（設計書 3.5）。境目は Fold8 の実機で測って確定した値

export const BREAKPOINTS = { M: 600, L: 1024 };

export const MEDIA = {
  M: `(min-width: ${BREAKPOINTS.M}px)`,
  L: `(min-width: ${BREAKPOINTS.L}px)`,
};

export function sizeClass(width) {
  if (width >= BREAKPOINTS.L) return 'L';
  if (width >= BREAKPOINTS.M) return 'M';
  return 'S';
}
