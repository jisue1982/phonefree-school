const ALLOWED_ACTIONS = new Set([
  'login',
  'save',
  'teacherLogin',
  'getStates',
  'deleteStudentData'
]);

const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB

// --- 호출 제한(무제한 호출·비밀번호 무차별 시도 방지) ---
// 서버리스 인스턴스별 메모리 기반이라 완벽하지 않지만, 한 IP에서의 반복 시도를 크게 늦춘다.
const RATE = {
  general: { windowMs: 60_000, max: 60 },      // IP당 분당 60회
  login:   { windowMs: 10 * 60_000, max: 12 }  // login/teacherLogin은 IP당 10분에 12회
};
const LOGIN_ACTIONS = new Set(['login', 'teacherLogin']);
const buckets = new Map();
function hit(key, rule) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) { b = { n: 0, reset: now + rule.windowMs }; buckets.set(key, b); }
  b.n++;
  if (buckets.size > 5000) { for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k); }
  return b.n <= rule.max;
}
function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '');
  return (xf.split(',')[0] || req.socket?.remoteAddress || 'unknown').trim();
}

// --- 출처 확인(다른 사이트에서 API를 자기 것처럼 부르는 것 방지) ---
// 같은 호스트 또는 ALLOWED_ORIGINS 환경변수(쉼표 구분)에 적힌 출처만 허용.
function originAllowed(req) {
  const origin = String(req.headers['origin'] || '');
  const referer = String(req.headers['referer'] || '');
  const host = String(req.headers['x-forwarded-host'] || req.headers['host'] || '');
  const allowed = new Set(
    String(process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean)
  );
  if (host) allowed.add('https://' + host);
  let src = origin;
  if (!src && referer) { try { src = new URL(referer).origin; } catch { src = ''; } }
  if (!src) return false;               // 출처 헤더가 아예 없으면 거부(스크립트·도구 호출)
  return allowed.has(src);
}

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

  if (!originAllowed(req)) {
    return send(res, 403, { ok:false, msg:'허용되지 않은 출처입니다.' });
  }

  const ip = clientIp(req);
  if (!hit('g:' + ip, RATE.general)) {
    res.setHeader('Retry-After', '60');
    return send(res, 429, { ok:false, msg:'요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
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
  if (LOGIN_ACTIONS.has(action) && !hit('l:' + ip, RATE.login)) {
    res.setHeader('Retry-After', '600');
    return send(res, 429, { ok:false, msg:'로그인 시도가 너무 많습니다. 10분 뒤 다시 시도해 주세요.' });
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
