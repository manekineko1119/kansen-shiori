// ログイン画面（#/login。設計書 7.1・9章）
const MESSAGES = {
  not_invited: 'このアカウントは招待されていません。管理者に連絡してください',
  failed: 'ログインできませんでした。もう一度お試しください',
  expired: 'ログインの有効期限が切れました。もう一度ログインしてください（ログインのあと、元の画面に戻ります）',
};

// error：'not_invited' | 'failed' | 'expired' | null。user があればログイン中の表示
export function renderLogin({ error, user, onSignIn, onSignOut }) {
  const sec = document.createElement('section');
  sec.className = 'sec';
  sec.innerHTML = '<h2>ログイン</h2>';
  if (user) {
    const p = document.createElement('p');
    p.textContent = user.isAdmin ? 'ログインしています（管理者）。' : 'ログインしています。';
    const out = button('ログアウト', 'btn btn-sub', onSignOut);
    sec.append(p, out);
    return sec;
  }
  const p = document.createElement('p');
  p.className = 'muted';
  p.textContent = '遠征予定・観戦記録を使うには、招待された Google アカウントでログインしてください。';
  sec.append(p);
  if (error) {
    const e = document.createElement('p');
    e.className = 'err note';
    e.setAttribute('role', 'alert');
    e.textContent = MESSAGES[error] ?? MESSAGES.failed;
    sec.append(e);
  }
  const btn = button('Googleでログイン', 'btn', async () => {
    btn.disabled = true;
    try {
      await onSignIn();
    } catch {
      btn.disabled = false;
      const e = document.createElement('p');
      e.className = 'err';
      e.setAttribute('role', 'alert');
      e.textContent = MESSAGES.failed;
      btn.after(e);
    }
  });
  sec.append(btn);
  return sec;
}

function button(label, cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
