const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const crypto = require('crypto');
const bootstrap = require('./bootstrap-data.json');

const app = express();
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Sao_Paulo';
const ROOT = __dirname;

if (!process.env.DATABASE_URL) {
  console.warn('[ESCALA] DATABASE_URL não configurada. A API só funcionará após configurar o PostgreSQL.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 4),
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const AUTH_TTL_SECONDS = Number(process.env.ESCALA_AUTH_TTL_SECONDS || 8 * 60 * 60);
const AUTH_SECRET = crypto.createHash('sha256').update(
  String(process.env.ESCALA_AUTH_SECRET || process.env.DATABASE_URL || 'escala-biotec-dev-only')
).digest();
const loginAttempts = new Map();

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}
function signToken(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest();
  let received;
  try { received = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function passwordOk(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const candidate = crypto.scryptSync(String(password), parts[1], 64);
  const expected = Buffer.from(parts[2], 'hex');
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
}
function normalizeUsername(v) {
  return String(v || '').trim().toLowerCase();
}
function authTokenFrom(req) {
  const h = String(req.headers.authorization || '');
  return /^Bearer\s+/i.test(h) ? h.replace(/^Bearer\s+/i, '').trim() : '';
}
async function requireAuth(req, res, next) {
  try {
    const payload = verifyToken(authTokenFrom(req));
    if (!payload?.uid) return res.status(401).json({ erro: 'Login necessário.' });
    const user = await dbGet('SELECT id,username,nome,role,ativo FROM usuarios_v5 WHERE id=?', [Number(payload.uid)]);
    if (!user || Number(user.ativo) !== 1) return res.status(401).json({ erro: 'Sessão inválida ou usuário desativado.' });
    req.auth = { id:Number(user.id), username:user.username, nome:user.nome, role:user.role };
    next();
  } catch (err) { res.status(401).json({ erro: 'Sessão inválida.' }); }
}
function requireEditor(req, res, next) {
  return requireAuth(req, res, () => {
    if (!['ADMIN','USUARIO'].includes(req.auth.role)) return res.status(403).json({ erro: 'Sem permissão de edição.' });
    next();
  });
}
function requireAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    if (req.auth.role !== 'ADMIN') return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
    next();
  });
}
function loginKey(req, username) {
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  return `${ip}|${username}`;
}
function loginBlocked(key) {
  const row = loginAttempts.get(key);
  if (!row) return false;
  if (Date.now() - row.started > 15 * 60 * 1000) { loginAttempts.delete(key); return false; }
  return row.count >= 6;
}
function noteLoginFailure(key) {
  const row = loginAttempts.get(key);
  if (!row || Date.now() - row.started > 15 * 60 * 1000) loginAttempts.set(key, { count:1, started:Date.now() });
  else row.count += 1;
}

app.use(cors());
app.use(express.json({ limit: '3mb' }));
app.use(express.static(path.join(ROOT, 'public'), {
  etag: false,
  lastModified: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

function pgSql(sql) {
  let i = 0;
  return String(sql).replace(/\?/g, () => `$${++i}`);
}
async function dbAll(sql, params = []) {
  const result = await pool.query(pgSql(sql), params);
  return result.rows;
}
async function dbGet(sql, params = []) {
  const result = await pool.query(pgSql(sql), params);
  return result.rows[0];
}
async function dbRun(sql, params = []) {
  let text = pgSql(sql).trim();
  if (/^INSERT\s+INTO\s+/i.test(text) && !/\bRETURNING\b/i.test(text)) text += ' RETURNING id';
  const result = await pool.query(text, params);
  return { rowCount: result.rowCount, lastID: result.rows?.[0]?.id ?? null };
}

function normalizarTexto(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function ordenarColaboradores(rows) {
  return [...rows].sort((a, b) => {
    const fa = normalizarTexto(a.funcao || '');
    const fb = normalizarTexto(b.funcao || '');
    if (fa !== fb) return fa.localeCompare(fb, 'pt-BR');
    return normalizarTexto(a.nome).localeCompare(normalizarTexto(b.nome), 'pt-BR');
  });
}

const DAY_MS = 86400000;
function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return d;
}
function fmtISO(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function addDays(value, n) {
  const d = value instanceof Date ? value : parseISO(value);
  return new Date(d.getTime() + Number(n) * DAY_MS);
}
function diffDays(a, b) {
  const da = a instanceof Date ? a : parseISO(a);
  const dbb = b instanceof Date ? b : parseISO(b);
  return Math.round((da.getTime() - dbb.getTime()) / DAY_MS);
}
function monthBounds(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month, 1));
  const end = addDays(next, -1);
  return { start, end, days: end.getUTCDate() };
}
function todayISO() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function rangesOverlap(a1, a2, b1, b2) {
  return a1 <= b2 && b1 <= a2;
}
function isOff(status) {
  return status === 'SAIDA' || status === 'FOLGA' || status === 'FERIAS';
}

let initPromise = null;
async function initDb() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');

    await pool.query(`CREATE TABLE IF NOT EXISTS colaboradores_v5 (
      id BIGSERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      categoria TEXT NOT NULL CHECK (categoria IN ('MOTORISTA','OPERADOR')),
      funcao TEXT NOT NULL DEFAULT '',
      subtipo TEXT NOT NULL DEFAULT '',
      regime_trabalho INTEGER NOT NULL,
      regime_folga INTEGER NOT NULL,
      anchor_saida TEXT,
      fonte TEXT NOT NULL DEFAULT '',
      observacao TEXT NOT NULL DEFAULT '',
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(nome, categoria, funcao)
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS ajustes_v5 (
      id BIGSERIAL PRIMARY KEY,
      colaborador_id BIGINT NOT NULL REFERENCES colaboradores_v5(id) ON DELETE CASCADE,
      base_saida TEXT NOT NULL,
      base_retorno TEXT NOT NULL,
      nova_saida TEXT NOT NULL,
      novo_retorno TEXT NOT NULL,
      observacao TEXT NOT NULL DEFAULT '',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(colaborador_id, base_saida)
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS ausencias_v5 (
      id BIGSERIAL PRIMARY KEY,
      colaborador_id BIGINT NOT NULL REFERENCES colaboradores_v5(id) ON DELETE CASCADE,
      inicio TEXT NOT NULL,
      fim TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'FERIAS',
      observacao TEXT NOT NULL DEFAULT '',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS historico_v5 (
      id BIGSERIAL PRIMARY KEY,
      colaborador_id BIGINT REFERENCES colaboradores_v5(id) ON DELETE SET NULL,
      acao TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);


    await pool.query(`CREATE TABLE IF NOT EXISTS usuarios_v5 (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL DEFAULT '',
      senha_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN','USUARIO')),
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`ALTER TABLE ausencias_v5 ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`);

    const userCount = await pool.query('SELECT COUNT(*)::int AS total FROM usuarios_v5');
    if (Number(userCount.rows[0]?.total || 0) === 0) {
      const adminUser = normalizeUsername(process.env.ESCALA_ADMIN_USER || '');
      const adminPassword = String(process.env.ESCALA_ADMIN_PASSWORD || '');
      if (adminUser && adminPassword.length >= 8) {
        await pool.query(`INSERT INTO usuarios_v5(username,nome,senha_hash,role) VALUES ($1,$2,$3,'ADMIN') ON CONFLICT (username) DO NOTHING`, [
          adminUser,
          String(process.env.ESCALA_ADMIN_NAME || 'Administrador'),
          passwordHash(adminPassword)
        ]);
      } else {
        console.warn('[ESCALA] Nenhum usuário administrativo existe. Configure ESCALA_ADMIN_USER e ESCALA_ADMIN_PASSWORD no Netlify e redeploy.');
      }
    }

    const count = await pool.query('SELECT COUNT(*)::int AS total FROM colaboradores_v5');
    if (Number(count.rows[0]?.total || 0) === 0) {
      for (const row of bootstrap.colaboradores_v5 || []) {
        await pool.query(`INSERT INTO colaboradores_v5
          (id,nome,categoria,funcao,subtipo,regime_trabalho,regime_folga,anchor_saida,fonte,observacao,ativo,criado_em,atualizado_em)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12::timestamptz,CURRENT_TIMESTAMP),COALESCE($13::timestamptz,CURRENT_TIMESTAMP))
          ON CONFLICT (id) DO NOTHING`, [
          row.id,row.nome,row.categoria,row.funcao || '',row.subtipo || '',row.regime_trabalho,row.regime_folga,row.anchor_saida || null,
          row.fonte || '',row.observacao || '',row.ativo == null ? 1 : row.ativo,row.criado_em || null,row.atualizado_em || null
        ]);
      }
      for (const row of bootstrap.ajustes_v5 || []) {
        await pool.query(`INSERT INTO ajustes_v5
          (id,colaborador_id,base_saida,base_retorno,nova_saida,novo_retorno,observacao,criado_em,atualizado_em)
          VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz,CURRENT_TIMESTAMP),COALESCE($9::timestamptz,CURRENT_TIMESTAMP))
          ON CONFLICT (id) DO NOTHING`, [row.id,row.colaborador_id,row.base_saida,row.base_retorno,row.nova_saida,row.novo_retorno,row.observacao || '',row.criado_em || null,row.atualizado_em || null]);
      }
      for (const row of bootstrap.ausencias_v5 || []) {
        await pool.query(`INSERT INTO ausencias_v5
          (id,colaborador_id,inicio,fim,tipo,observacao,criado_em)
          VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,CURRENT_TIMESTAMP))
          ON CONFLICT (id) DO NOTHING`, [row.id,row.colaborador_id,row.inicio,row.fim,row.tipo || 'FERIAS',row.observacao || '',row.criado_em || null]);
      }
      for (const row of bootstrap.historico_v5 || []) {
        await pool.query(`INSERT INTO historico_v5
          (id,colaborador_id,acao,payload,criado_em)
          VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz,CURRENT_TIMESTAMP))
          ON CONFLICT (id) DO NOTHING`, [row.id,row.colaborador_id,row.acao,row.payload || '{}',row.criado_em || null]);
      }
      await pool.query(`SELECT setval(pg_get_serial_sequence('colaboradores_v5','id'), GREATEST(COALESCE((SELECT MAX(id) FROM colaboradores_v5),1),1), true)`);
      await pool.query(`SELECT setval(pg_get_serial_sequence('ajustes_v5','id'), GREATEST(COALESCE((SELECT MAX(id) FROM ajustes_v5),1),1), true)`);
      await pool.query(`SELECT setval(pg_get_serial_sequence('ausencias_v5','id'), GREATEST(COALESCE((SELECT MAX(id) FROM ausencias_v5),1),1), true)`);
      await pool.query(`SELECT setval(pg_get_serial_sequence('historico_v5','id'), GREATEST(COALESCE((SELECT MAX(id) FROM historico_v5),1),1), true)`);
    }
  })().catch(err => {
    initPromise = null;
    throw err;
  });
  return initPromise;
}

app.use(async (_req, res, next) => {
  try { await initDb(); next(); }
  catch (err) { res.status(500).json({ erro: err.message }); }
});

function gerarCiclosBase(emp, start, end, ajustesMap) {
  if (!emp.anchor_saida || !parseISO(emp.anchor_saida)) return [];
  const anchor = parseISO(emp.anchor_saida);
  const cycleLen = Number(emp.regime_trabalho) + Number(emp.regime_folga);
  const n0 = Math.floor(diffDays(start, anchor) / cycleLen) - 2;
  const n1 = Math.ceil(diffDays(end, anchor) / cycleLen) + 2;
  const cycles = [];

  for (let n = n0; n <= n1; n++) {
    const baseExitDate = addDays(anchor, n * cycleLen);
    const baseReturnDate = addDays(baseExitDate, Number(emp.regime_folga));
    const base_saida = fmtISO(baseExitDate);
    const base_retorno = fmtISO(baseReturnDate);
    const adj = ajustesMap.get(base_saida);
    const nova_saida = adj ? adj.nova_saida : base_saida;
    const novo_retorno = adj ? adj.novo_retorno : base_retorno;
    cycles.push({
      base_saida,
      base_retorno,
      nova_saida,
      novo_retorno,
      adjusted: !!adj,
      adjustment_id: adj ? adj.id : null,
      observacao: adj ? adj.observacao : ''
    });
  }
  return cycles;
}

function marcarCiclo(map, saida, retorno) {
  const s = parseISO(saida);
  const r = parseISO(retorno);
  if (!s || !r || r <= s) return;
  let d = s;
  let i = 0;
  while (d < r) {
    map.set(fmtISO(d), i === 0 ? 'SAIDA' : 'FOLGA');
    d = addDays(d, 1);
    i++;
  }
  map.set(fmtISO(r), 'RETORNO');
}

function montarEscalaColaborador(emp, year, month, ajustes, ausencias) {
  const { start, end, days } = monthBounds(year, month);
  const extStart = addDays(start, -40);
  const extEnd = addDays(end, 40);
  const adjMap = new Map(ajustes.map(a => [a.base_saida, a]));
  const cycles = gerarCiclosBase(emp, extStart, extEnd, adjMap);
  const baseMap = new Map();
  const currentMap = new Map();

  for (const c of cycles) {
    marcarCiclo(baseMap, c.base_saida, c.base_retorno);
    marcarCiclo(currentMap, c.nova_saida, c.novo_retorno);
  }

  for (const a of ausencias) {
    if (a.tipo !== 'FERIAS') continue;
    let d = parseISO(a.inicio);
    const f = parseISO(a.fim);
    if (!d || !f) continue;
    while (d <= f) {
      currentMap.set(fmtISO(d), 'FERIAS');
      d = addDays(d, 1);
    }
  }

  const cells = [];
  let diasBase = emp.anchor_saida ? 0 : null;
  let diasAtual = emp.anchor_saida ? 0 : null;
  let changedDays = 0;

  for (let day = 1; day <= days; day++) {
    const date = fmtISO(new Date(Date.UTC(year, month - 1, day)));
    const base = emp.anchor_saida ? (baseMap.get(date) || 'NORMAL') : 'SEM_ESCALA';
    const current = emp.anchor_saida ? (currentMap.get(date) || 'NORMAL') : 'SEM_ESCALA';
    const changed = base !== current;
    if (changed) changedDays++;
    if (diasBase !== null && !isOff(base)) diasBase++;
    if (diasAtual !== null && !isOff(current)) diasAtual++;
    cells.push({ day, date, base, current, changed });
  }

  const monthStartISO = fmtISO(start);
  const monthEndISO = fmtISO(end);
  const visibleCycles = cycles.filter(c => {
    const left = c.base_saida < c.nova_saida ? c.base_saida : c.nova_saida;
    const right = c.base_retorno > c.novo_retorno ? c.base_retorno : c.novo_retorno;
    const paddingStart = fmtISO(addDays(start, -20));
    const paddingEnd = fmtISO(addDays(end, 20));
    return rangesOverlap(left, right, paddingStart, paddingEnd);
  });

  const feriasVisiveis = ausencias.filter(a => rangesOverlap(a.inicio, a.fim, monthStartISO, monthEndISO));

  return {
    ...emp,
    days_base: diasBase,
    days_current: diasAtual,
    changed: changedDays > 0 || visibleCycles.some(c => c.adjusted),
    changed_days: changedDays,
    cells,
    cycles: visibleCycles,
    absences: feriasVisiveis
  };
}

async function loadSchedule({ categoria, funcao, year, month }) {
  const params = [categoria];
  let whereFunc = '';
  if (categoria === 'OPERADOR' && funcao) {
    whereFunc = ' AND funcao = ?';
    params.push(funcao);
  }
  const employees = ordenarColaboradores(await dbAll(`SELECT * FROM colaboradores_v5 WHERE ativo=1 AND categoria=?${whereFunc}`, params));
  if (!employees.length) return [];
  const ids = employees.map(e => e.id);
  const qs = ids.map(() => '?').join(',');
  const ajustes = await dbAll(`SELECT * FROM ajustes_v5 WHERE colaborador_id IN (${qs})`, ids);
  const { start, end } = monthBounds(year, month);
  const startISO = fmtISO(start), endISO = fmtISO(end);
  const ausencias = await dbAll(`SELECT * FROM ausencias_v5 WHERE colaborador_id IN (${qs}) AND fim>=? AND inicio<=?`, [...ids, startISO, endISO]);
  const adjBy = new Map(), absBy = new Map();
  for (const e of employees) { adjBy.set(e.id, []); absBy.set(e.id, []); }
  for (const a of ajustes) if (adjBy.has(a.colaborador_id)) adjBy.get(a.colaborador_id).push(a);
  for (const a of ausencias) if (absBy.has(a.colaborador_id)) absBy.get(a.colaborador_id).push(a);
  return employees.map(e => montarEscalaColaborador(e, year, month, adjBy.get(e.id), absBy.get(e.id)));
}


app.get('/api/v5/auth/status', async (_req, res) => {
  try {
    const count = await dbGet('SELECT COUNT(*) AS total FROM usuarios_v5 WHERE ativo=1');
    res.json({ ok:true, has_users:Number(count?.total || 0) > 0 });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/v5/auth/login', async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || '');
    const key = loginKey(req, username);
    if (loginBlocked(key)) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    const user = await dbGet('SELECT * FROM usuarios_v5 WHERE username=?', [username]);
    if (!user || Number(user.ativo) !== 1 || !passwordOk(password, user.senha_hash)) {
      noteLoginFailure(key);
      return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
    }
    loginAttempts.delete(key);
    const exp = Math.floor(Date.now() / 1000) + AUTH_TTL_SECONDS;
    const token = signToken({ uid:Number(user.id), username:user.username, role:user.role, exp, nonce:crypto.randomBytes(8).toString('hex') });
    res.json({ token, user:{ id:Number(user.id), username:user.username, nome:user.nome, role:user.role }, expires_at:exp });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get('/api/v5/auth/me', requireAuth, async (req, res) => {
  res.json({ user:req.auth });
});

app.get('/api/v5/usuarios', requireAdmin, async (_req, res) => {
  try {
    const rows = await dbAll('SELECT id,username,nome,role,ativo,criado_em,atualizado_em FROM usuarios_v5 ORDER BY ativo DESC, role, username');
    res.json(rows.map(r => ({ ...r, id:Number(r.id), ativo:Number(r.ativo) })));
  } catch (err) { res.status(500).json({ erro:err.message }); }
});

app.post('/api/v5/usuarios', requireAdmin, async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const nome = String(req.body.nome || '').trim();
    const role = String(req.body.role || 'USUARIO').toUpperCase();
    const password = String(req.body.password || '');
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) return res.status(400).json({ erro:'Usuário deve ter 3 a 40 caracteres: letras, números, ponto, traço ou sublinhado.' });
    if (!['ADMIN','USUARIO'].includes(role)) return res.status(400).json({ erro:'Perfil inválido.' });
    if (password.length < 8) return res.status(400).json({ erro:'A senha precisa ter pelo menos 8 caracteres.' });
    const info = await dbRun('INSERT INTO usuarios_v5(username,nome,senha_hash,role) VALUES (?,?,?,?)', [username,nome,passwordHash(password),role]);
    res.json({ ok:true, id:info.lastID });
  } catch (err) { res.status(400).json({ erro:/UNIQUE/i.test(err.message)?'Esse usuário já existe.':err.message }); }
});

app.put('/api/v5/usuarios/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const old = await dbGet('SELECT * FROM usuarios_v5 WHERE id=?', [id]);
    if (!old) return res.status(404).json({ erro:'Usuário não encontrado.' });
    const nome = req.body.nome == null ? old.nome : String(req.body.nome).trim();
    const role = req.body.role == null ? old.role : String(req.body.role).toUpperCase();
    const ativo = req.body.ativo == null ? Number(old.ativo) : (req.body.ativo ? 1 : 0);
    if (!['ADMIN','USUARIO'].includes(role)) return res.status(400).json({ erro:'Perfil inválido.' });
    if (id === req.auth.id && (ativo !== 1 || role !== 'ADMIN')) return res.status(400).json({ erro:'O administrador logado não pode desativar nem remover o próprio perfil de administrador.' });
    const password = String(req.body.password || '');
    if (password && password.length < 8) return res.status(400).json({ erro:'A nova senha precisa ter pelo menos 8 caracteres.' });
    if (password) await dbRun('UPDATE usuarios_v5 SET nome=?,role=?,ativo=?,senha_hash=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=?', [nome,role,ativo,passwordHash(password),id]);
    else await dbRun('UPDATE usuarios_v5 SET nome=?,role=?,ativo=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=?', [nome,role,ativo,id]);
    res.json({ ok:true });
  } catch (err) { res.status(400).json({ erro:err.message }); }
});

app.get('/api/v5/health', async (_req, res) => {
  try {
    const total = await dbGet('SELECT COUNT(*) AS total FROM colaboradores_v5 WHERE ativo=1');
    res.json({ ok: true, version: '5.3.0', colaboradores: total.total, timezone: APP_TIMEZONE });
  } catch (err) { res.status(500).json({ ok: false, erro: err.message }); }
});

app.get('/api/v5/escala', async (req, res) => {
  try {
    const now = new Date();
    const categoria = String(req.query.categoria || 'MOTORISTA').toUpperCase();
    const funcao = normalizarTexto(req.query.funcao || '');
    const month = Number(req.query.mes || now.getMonth() + 1);
    const year = Number(req.query.ano || now.getFullYear());
    if (!['MOTORISTA','OPERADOR'].includes(categoria) || month < 1 || month > 12 || year < 2020 || year > 2100) {
      return res.status(400).json({ erro: 'Parâmetros inválidos' });
    }
    const employees = await loadSchedule({ categoria, funcao, year, month });
    const today = todayISO();
    const alertDates = new Map([
      [today, 'hoje'],
      [fmtISO(addDays(parseISO(today), 1)), 'amanhã'],
      [fmtISO(addDays(parseISO(today), 2)), 'em 2 dias']
    ]);
    const alerts = [];
    for (const e of employees) {
      for (const c of e.cells) {
        const when = alertDates.get(c.date);
        if (!when) continue;
        if (c.current === 'SAIDA') alerts.push({ kind: 'saida', date: c.date, employee_id: e.id, nome: e.nome, funcao: e.funcao, when });
        if (c.current === 'RETORNO') alerts.push({ kind: 'retorno', date: c.date, employee_id: e.id, nome: e.nome, funcao: e.funcao, when });
      }
    }
    res.json({ version: '5.3.0', categoria, funcao, mes: month, ano: year, employees, alerts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message });
  }
});

app.get('/api/v5/colaboradores', async (req, res) => {
  try {
    const categoria = String(req.query.categoria || '').toUpperCase();
    const params = [];
    let where = 'WHERE ativo=1';
    if (categoria) { where += ' AND categoria=?'; params.push(categoria); }
    const rows = await dbAll(`SELECT * FROM colaboradores_v5 ${where}`, params);
    res.json(ordenarColaboradores(rows));
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/v5/colaboradores', requireEditor, async (req, res) => {
  try {
    const nome = normalizarTexto(req.body.nome);
    const categoria = String(req.body.categoria || '').toUpperCase();
    const funcao = categoria === 'OPERADOR' ? normalizarTexto(req.body.funcao) : '';
    const subtipo = categoria === 'MOTORISTA' ? normalizarTexto(req.body.subtipo || 'FIXO') : '';
    const anchor = req.body.anchor_saida ? String(req.body.anchor_saida) : null;
    if (!nome || !['MOTORISTA','OPERADOR'].includes(categoria)) return res.status(400).json({ erro: 'Nome e categoria são obrigatórios.' });
    if (categoria === 'OPERADOR' && !['SKIDDER','FELLER','PC','PICADOR'].includes(funcao)) return res.status(400).json({ erro: 'Função de operador inválida.' });
    if (anchor && !parseISO(anchor)) return res.status(400).json({ erro: 'Data base inválida.' });
    const work = categoria === 'MOTORISTA' ? 23 : 24;
    const off = categoria === 'MOTORISTA' ? 7 : 6;
    const existing = await dbGet('SELECT * FROM colaboradores_v5 WHERE nome=? AND categoria=? AND funcao=?', [nome,categoria,funcao]);
    if (existing) {
      if (Number(existing.ativo) === 1) return res.status(409).json({ erro: 'Esse colaborador já existe nessa escala.' });
      const ajusteCount = await dbGet('SELECT COUNT(*) AS total FROM ajustes_v5 WHERE colaborador_id=?', [existing.id]);
      if (Number(ajusteCount.total) > 0 && anchor && anchor !== existing.anchor_saida) {
        return res.status(409).json({ erro: 'Este colaborador desativado possui ajustes históricos. Reative usando a mesma data base para preservar os ajustes.' });
      }
      const reactivatedAnchor = anchor || existing.anchor_saida || null;
      await dbRun(`UPDATE colaboradores_v5 SET ativo=1,subtipo=?,regime_trabalho=?,regime_folga=?,anchor_saida=?,observacao=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=?`,
        [subtipo,work,off,reactivatedAnchor,String(req.body.observacao || existing.observacao || ''),existing.id]);
      await dbRun(`INSERT INTO historico_v5(colaborador_id,acao,payload) VALUES (?,?,?)`, [existing.id,'REATIVAR',JSON.stringify({ nome,categoria,funcao,subtipo,anchor_saida:reactivatedAnchor })]);
      return res.json({ ok: true, id: existing.id, reativado: true });
    }
    const info = await dbRun(`INSERT INTO colaboradores_v5
      (nome,categoria,funcao,subtipo,regime_trabalho,regime_folga,anchor_saida,fonte,observacao)
      VALUES (?,?,?,?,?,?,?,'Cadastro manual',?)`, [nome,categoria,funcao,subtipo,work,off,anchor,String(req.body.observacao || '')]);
    await dbRun(`INSERT INTO historico_v5(colaborador_id,acao,payload) VALUES (?,?,?)`, [info.lastID,'CADASTRO',JSON.stringify({ nome,categoria,funcao,subtipo,anchor })]);
    res.json({ ok: true, id: info.lastID });
  } catch (err) {
    res.status(400).json({ erro: /UNIQUE/i.test(err.message) ? 'Esse colaborador já existe nessa escala.' : err.message });
  }
});

app.put('/api/v5/colaboradores/:id', requireEditor, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const old = await dbGet('SELECT * FROM colaboradores_v5 WHERE id=?', [id]);
    if (!old) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
    const nome = normalizarTexto(req.body.nome || old.nome);
    const funcao = old.categoria === 'OPERADOR' ? normalizarTexto(req.body.funcao || old.funcao) : '';
    const subtipo = old.categoria === 'MOTORISTA' ? normalizarTexto(req.body.subtipo || old.subtipo || 'FIXO') : '';
    const anchor = req.body.anchor_saida === '' ? null : (req.body.anchor_saida || old.anchor_saida);
    if (anchor && !parseISO(anchor)) return res.status(400).json({ erro: 'Data base inválida.' });
    if (old.categoria === 'OPERADOR' && !['SKIDDER','FELLER','PC','PICADOR'].includes(funcao)) return res.status(400).json({ erro: 'Função inválida.' });
    if (anchor !== old.anchor_saida) {
      const ajusteCount = await dbGet('SELECT COUNT(*) AS total FROM ajustes_v5 WHERE colaborador_id=?', [id]);
      if (Number(ajusteCount.total) > 0) {
        return res.status(409).json({ erro: 'A data base não pode ser alterada enquanto existirem ajustes de ciclo. Reverta os ajustes primeiro para evitar perda silenciosa do histórico visual.' });
      }
    }
    await dbRun(`UPDATE colaboradores_v5 SET nome=?,funcao=?,subtipo=?,anchor_saida=?,observacao=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=?`, [nome,funcao,subtipo,anchor,String(req.body.observacao || old.observacao || ''),id]);
    await dbRun(`INSERT INTO historico_v5(colaborador_id,acao,payload) VALUES (?,?,?)`, [id,'ALTERAR_CADASTRO',JSON.stringify({ antes: old, depois: { nome,funcao,subtipo,anchor_saida: anchor } })]);
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ erro: /UNIQUE/i.test(err.message) ? 'Já existe outro colaborador com esse nome e função nesta escala.' : err.message }); }
});

app.delete('/api/v5/colaboradores/:id', requireEditor, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const old = await dbGet('SELECT * FROM colaboradores_v5 WHERE id=?', [id]);
    if (!old) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
    await dbRun('UPDATE colaboradores_v5 SET ativo=0,atualizado_em=CURRENT_TIMESTAMP WHERE id=?', [id]);
    await dbRun(`INSERT INTO historico_v5(colaborador_id,acao,payload) VALUES (?,?,?)`, [id,'DESATIVAR',JSON.stringify(old)]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

async function getEmployee(id) {
  return await dbGet('SELECT * FROM colaboradores_v5 WHERE id=? AND ativo=1', [Number(id)]);
}

function baseCycleValid(emp, base_saida) {
  if (!emp.anchor_saida || !parseISO(emp.anchor_saida) || !parseISO(base_saida)) return false;
  const cycleLen = Number(emp.regime_trabalho) + Number(emp.regime_folga);
  const delta = diffDays(base_saida, emp.anchor_saida);
  return ((delta % cycleLen) + cycleLen) % cycleLen === 0;
}

app.post('/api/v5/ajustes', requireEditor, async (req, res) => {
  try {
    const colaboradorId = Number(req.body.colaborador_id);
    const emp = await getEmployee(colaboradorId);
    if (!emp) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
    const baseSaida = String(req.body.base_saida || '');
    if (!baseCycleValid(emp, baseSaida)) return res.status(400).json({ erro: 'Ciclo original inválido para esse colaborador.' });
    const baseRetorno = fmtISO(addDays(parseISO(baseSaida), Number(emp.regime_folga)));
    const novaSaida = String(req.body.nova_saida || baseSaida);
    const novoRetorno = String(req.body.novo_retorno || baseRetorno);
    if (!parseISO(novaSaida) || !parseISO(novoRetorno) || diffDays(novoRetorno, novaSaida) <= 0) return res.status(400).json({ erro: 'Saída e retorno ajustados são inválidos.' });

    const cycleLen = Number(emp.regime_trabalho) + Number(emp.regime_folga);
    const prevBase = fmtISO(addDays(parseISO(baseSaida), -cycleLen));
    const nextBase = fmtISO(addDays(parseISO(baseSaida), cycleLen));
    const prevAdj = await dbGet('SELECT * FROM ajustes_v5 WHERE colaborador_id=? AND base_saida=?', [colaboradorId, prevBase]);
    const nextAdj = await dbGet('SELECT * FROM ajustes_v5 WHERE colaborador_id=? AND base_saida=?', [colaboradorId, nextBase]);
    const prevReturn = prevAdj ? prevAdj.novo_retorno : fmtISO(addDays(parseISO(prevBase), Number(emp.regime_folga)));
    const nextExit = nextAdj ? nextAdj.nova_saida : nextBase;
    if (novaSaida < prevReturn) return res.status(400).json({ erro: `A nova saída não pode ficar antes do retorno do ciclo anterior (${prevReturn}).` });
    if (novoRetorno >= nextExit) return res.status(400).json({ erro: `O novo retorno precisa acontecer antes da próxima saída (${nextExit}).` });

    const before = await dbGet('SELECT * FROM ajustes_v5 WHERE colaborador_id=? AND base_saida=?', [colaboradorId, baseSaida]);
    if (novaSaida === baseSaida && novoRetorno === baseRetorno && !String(req.body.observacao || '').trim()) {
      await dbRun('DELETE FROM ajustes_v5 WHERE colaborador_id=? AND base_saida=?', [colaboradorId, baseSaida]);
    } else {
      await dbRun(`INSERT INTO ajustes_v5(colaborador_id,base_saida,base_retorno,nova_saida,novo_retorno,observacao)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(colaborador_id,base_saida) DO UPDATE SET
          base_retorno=excluded.base_retorno,
          nova_saida=excluded.nova_saida,
          novo_retorno=excluded.novo_retorno,
          observacao=excluded.observacao,
          atualizado_em=CURRENT_TIMESTAMP`, [colaboradorId,baseSaida,baseRetorno,novaSaida,novoRetorno,String(req.body.observacao || '')]);
    }
    const after = await dbGet('SELECT * FROM ajustes_v5 WHERE colaborador_id=? AND base_saida=?', [colaboradorId, baseSaida]);
    await dbRun(`INSERT INTO historico_v5(colaborador_id,acao,payload) VALUES (?,?,?)`, [colaboradorId,'AJUSTAR_CICLO',JSON.stringify({ antes: before, depois: after, base: { saida: baseSaida, retorno: baseRetorno } })]);
    res.json({ ok: true, base_saida: baseSaida, base_retorno: baseRetorno, nova_saida: novaSaida, novo_retorno: novoRetorno });
  } catch (err) { console.error(err); res.status(500).json({ erro: err.message }); }
});

app.delete('/api/v5/ajustes', requireEditor, async (req, res) => {
  try {
    const colaboradorId = Number(req.query.colaborador_id);
    const baseSaida = String(req.query.base_saida || '');
    const before = await dbGet('SELECT * FROM ajustes_v5 WHERE colaborador_id=? AND base_saida=?', [colaboradorId, baseSaida]);
    await dbRun('DELETE FROM ajustes_v5 WHERE colaborador_id=? AND base_saida=?', [colaboradorId, baseSaida]);
    if (before) await dbRun(`INSERT INTO historico_v5(colaborador_id,acao,payload) VALUES (?,?,?)`, [colaboradorId,'REVERTER_AJUSTE',JSON.stringify(before)]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post('/api/v5/ferias', requireEditor, async (req, res) => {
  try {
    const colaboradorId = Number(req.body.colaborador_id);
    const emp = await getEmployee(colaboradorId);
    if (!emp) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
    const inicio = String(req.body.inicio || ''), fim = String(req.body.fim || '');
    if (!parseISO(inicio) || !parseISO(fim) || fim < inicio) return res.status(400).json({ erro: 'Período de férias inválido.' });
    if (diffDays(fim, inicio) > 180) return res.status(400).json({ erro: 'Período de férias muito longo.' });
    const overlap = await dbGet(`SELECT id,inicio,fim FROM ausencias_v5 WHERE colaborador_id=? AND tipo='FERIAS' AND fim>=? AND inicio<=? LIMIT 1`, [colaboradorId,inicio,fim]);
    if (overlap) return res.status(409).json({ erro: `Já existe férias sobreposta neste período (${overlap.inicio} a ${overlap.fim}).` });
    const info = await dbRun(`INSERT INTO ausencias_v5(colaborador_id,inicio,fim,tipo,observacao) VALUES (?,?,?,'FERIAS',?)`, [colaboradorId,inicio,fim,String(req.body.observacao || '')]);
    await dbRun(`INSERT INTO historico_v5(colaborador_id,acao,payload) VALUES (?,?,?)`, [colaboradorId,'FERIAS',JSON.stringify({ id: info.lastID,inicio,fim,observacao:req.body.observacao || '' })]);
    res.json({ ok: true, id: info.lastID });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});


app.put('/api/v5/ferias/:id', requireEditor, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const before = await dbGet("SELECT * FROM ausencias_v5 WHERE id=? AND tipo='FERIAS'", [id]);
    if (!before) return res.status(404).json({ erro:'Período não encontrado.' });
    const inicio = String(req.body.inicio || '');
    const fim = String(req.body.fim || '');
    const observacao = String(req.body.observacao || '');
    if (!parseISO(inicio) || !parseISO(fim) || fim < inicio) return res.status(400).json({ erro:'Período de férias inválido.' });
    if (diffDays(fim, inicio) > 180) return res.status(400).json({ erro:'Período de férias muito longo.' });
    const overlap = await dbGet(`SELECT id,inicio,fim FROM ausencias_v5 WHERE colaborador_id=? AND tipo='FERIAS' AND id<>? AND fim>=? AND inicio<=? LIMIT 1`, [before.colaborador_id,id,inicio,fim]);
    if (overlap) return res.status(409).json({ erro:`Já existe férias sobreposta neste período (${overlap.inicio} a ${overlap.fim}).` });
    await dbRun('UPDATE ausencias_v5 SET inicio=?,fim=?,observacao=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=?', [inicio,fim,observacao,id]);
    const after = await dbGet('SELECT * FROM ausencias_v5 WHERE id=?', [id]);
    await dbRun(`INSERT INTO historico_v5(colaborador_id,acao,payload) VALUES (?,?,?)`, [before.colaborador_id,'ALTERAR_FERIAS',JSON.stringify({ antes:before, depois:after })]);
    res.json({ ok:true });
  } catch (err) { res.status(500).json({ erro:err.message }); }
});

app.delete('/api/v5/ferias/:id', requireEditor, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const before = await dbGet('SELECT * FROM ausencias_v5 WHERE id=?', [id]);
    if (!before) return res.status(404).json({ erro: 'Período não encontrado.' });
    await dbRun('DELETE FROM ausencias_v5 WHERE id=?', [id]);
    await dbRun(`INSERT INTO historico_v5(colaborador_id,acao,payload) VALUES (?,?,?)`, [before.colaborador_id,'REMOVER_FERIAS',JSON.stringify(before)]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get('/api/v5/historico/:id', requireEditor, async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM historico_v5 WHERE colaborador_id=? ORDER BY id DESC LIMIT 100', [Number(req.params.id)]);
    res.json(rows);
  } catch (err) { res.status(500).json({ erro: err.message }); }
});


module.exports = { app, initDb, pool };
