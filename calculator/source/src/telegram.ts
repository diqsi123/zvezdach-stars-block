/**
 * Подтверждение получателя по юзернейму.
 *
 * ВАЖНО: имя и аватар пользователя Telegram нельзя получить из браузера —
 * нужен серверный вызов с токеном бота (`getChat`), клиентский запрос к
 * api.telegram.org без токена ничего не отдаст, а токен в браузер выносить
 * нельзя. Поэтому здесь ожидается свой эндпоинт-прокси:
 *
 *   GET /api/telegram/resolve?username=durov
 *   → 200 { "name": "Pavel Durov", "avatar": "https://…" }
 *   → 404 если такого юзернейма нет
 *
 * Пока эндпоинта нет, включается локальная заглушка (см. MOCK), чтобы
 * состояние «получатель подтверждён» было видно в интерфейсе. Как только
 * бекенд появится — поставить RESOLVE_URL и выключить MOCK.
 */

export const RESOLVE_URL = '/api/telegram/resolve';
export const MOCK = true;

export type Recipient = { username: string; name: string; avatar?: string; initials: string };

const VALID = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

export function isValidUsername(v: string) {
  return VALID.test(v);
}

function initialsOf(name: string) {
  return name
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Оттенок аватара выводим из юзернейма, чтобы он не менялся между запросами. */
export function avatarHue(username: string) {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) % 360;
  return h;
}

async function mockResolve(username: string): Promise<Recipient | null> {
  await new Promise((r) => setTimeout(r, 420));
  // заглушка: «не найдены» только заведомо несуществующие
  if (/^(test|none|xxx)/i.test(username)) return null;
  const name = username
    .split(/[_.]/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
  return { username, name, initials: initialsOf(name) };
}

export async function resolveRecipient(username: string, signal?: AbortSignal): Promise<Recipient | null> {
  if (MOCK) return mockResolve(username);
  const res = await fetch(`${RESOLVE_URL}?username=${encodeURIComponent(username)}`, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`resolve failed: ${res.status}`);
  const data = (await res.json()) as { name: string; avatar?: string };
  return { username, name: data.name, avatar: data.avatar, initials: initialsOf(data.name) };
}
