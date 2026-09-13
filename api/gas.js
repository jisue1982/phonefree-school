const ALLOWED_ACTIONS = new Set([
  'login',
  'save',
  'teacherLogin',
  'getStates',
  'deleteStudentData'
]);

const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { ok:false, msg:'POST만 허용됩니다.' });
  }

  const gasUrl = process.env.GAS_WEBAPP_URL;
  const proxyKey = process.env.GAS_PROXY_KEY;
  if (!gasUrl || !proxyKey) {
    return send(res, 500, { ok:false, msg:'서버 환경설정이 완료되지 않았습니다.' });
  }

  const rawLen = Number(req.headers['content-length'] || 0);
  if (rawLen > MAX_BODY_BYTES) {
    return send(res, 413, { ok:false, msg:'요청 크기가 너무 큽니다.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return send(res, 400, {ok:false,msg:'잘못된 JSON입니다.'}); }
  }
  if (!body || typeof body !== 'object') return send(res, 400, {ok:false,msg:'요청 본문이 없습니다.'});

  const action = String(body.action || '');
  const args = Array.isArray(body.args) ? body.args : [];
  if (!ALLOWED_ACTIONS.has(action)) {
    return send(res, 403, { ok:false, msg:'허용되지 않은 작업입니다.' });
  }
  if (args.length > 4) {
    return send(res, 400, { ok:false, msg:'인자 수가 올바르지 않습니다.' });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const upstream = await fetch(gasUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ proxyKey, action, args }),
      signal: controller.signal
    });
    clearTimeout(timer);

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); }
    catch { return send(res, 502, {ok:false,msg:'백엔드 응답 형식이 올바르지 않습니다.'}); }

    if (!upstream.ok) return send(res, 502, {ok:false,msg:'백엔드 연결 오류'});
    return send(res, 200, data);
  } catch (err) {
    return send(res, 502, { ok:false, msg:'백엔드 연결에 실패했습니다.' });
  }
};
