import { assert } from './validation.js';

// Login tokens stay server-side and are shared by concurrent viewers of a camera.
export function reolinkSessions(request = fetch) {
  const sessions = new Map();
  return {
    async source(item) {
      const root = new URL(item.stream_url);
      let entry = sessions.get(item.id);
      const identity = JSON.stringify([
        item.stream_url,
        item.stream_username,
        item.stream_password,
      ]);
      if (!entry || entry.source !== identity || entry.expires <= Date.now()) {
        entry = { source: identity, expires: Infinity };
        entry.token = (async () => {
          const response = await request(new URL('/cgi-bin/api.cgi?cmd=Login', root.origin), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([
              {
                cmd: 'Login',
                action: 0,
                param: {
                  User: {
                    userName: item.stream_username,
                    password: item.stream_password,
                    Version: '0',
                  },
                },
              },
            ]),
            redirect: 'error',
            signal: AbortSignal.timeout(10000),
          });
          assert(response.ok, 'Reolink-Anmeldung nicht erreichbar.', 502);
          const data = await response.json();
          const token = data[0]?.value?.Token;
          assert(
            data[0]?.code === 0 && typeof token?.name === 'string' && token.name,
            'Reolink-Anmeldung abgelehnt.',
            502,
          );
          entry.expires = Date.now() + Math.max(1, (Number(token.leaseTime) || 60) - 30) * 1000;
          return token.name;
        })();
        sessions.set(item.id, entry);
        // Removed camera entries need not survive forever in a long-running process.
        for (const [id, value] of sessions) if (value.expires < Date.now()) sessions.delete(id);
      }
      try {
        root.searchParams.set('token', await entry.token);
        root.username = '';
        root.password = '';
        return root;
      } catch (error) {
        if (sessions.get(item.id) === entry) sessions.delete(item.id);
        throw error;
      }
    },
    clear() {
      sessions.clear();
    },
    invalidate(id) {
      sessions.delete(id);
    },
  };
}
