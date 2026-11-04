import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STORAGE_BUCKET = 'study-files';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const OWNER_EMAIL = 'iddadada1213@naver.com';
const ALLOWED_ORIGINS = new Set(['https://pdh-study.vercel.app', 'http://localhost:5173']);
const storage = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(STORAGE_BUCKET);
const extensions = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'hwp', 'hwpx']);
const safeMime: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', txt: 'text/plain' };
const previewMime = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain']);

function headers(origin: string | null) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://pdh-study.vercel.app',
    'access-control-allow-headers': 'authorization, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'cache-control': 'no-store',
    vary: 'Origin',
  };
}
function reply(value: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(value), { status, headers: headers(origin) });
}
function bad(message: string, origin: string | null, status = 400) {
  return reply({ error: message }, status, origin);
}
function validText(v: unknown, max: number, min = 0): v is string {
  return typeof v === 'string' && v.trim().length >= min && v.length <= max;
}
function validUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
async function db(table: string, method = 'GET', query = '', body?: unknown) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Database request failed (${response.status}): ${text.slice(0, 180)}`);
  return text ? JSON.parse(text) : [];
}
async function owner(req: Request) {
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return false;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${jwt}` },
  });
  if (!response.ok) return false;
  const user = await response.json();
  return user.email?.toLowerCase() === OWNER_EMAIL && !!user.email_confirmed_at;
}
const one = (rows: unknown[]) => rows[0] ?? null;
async function activeShare(token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = await sha256(token);
  const share = one(await db('study_shares', 'GET', `?token_hash=eq.${hash}&select=id,room_id,material_ids,can_practice,enabled,expires_at`));
  return share?.enabled && (!share.expires_at || Date.parse(share.expires_at) >= Date.now()) ? share : null;
}
async function removeFiles(paths: string[]) {
  if (!paths.length) return;
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await storage.remove(paths.slice(i, i + 100));
    if (error) throw error;
  }
}

Deno.serve(async req => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
  if (req.method !== 'POST') return bad('POST 요청만 사용할 수 있습니다.', origin, 405);
  if (req.headers.get('content-type')?.startsWith('multipart/form-data')) {
    try {
      if (!await owner(req)) return bad('관리자 로그인이 필요합니다.', origin, 401);
      const form = await req.formData();
      if (form.get('action') !== 'attachment.upload') return bad('알 수 없는 업로드 작업입니다.', origin);
      const materialId = form.get('material_id');
      const file = form.get('file');
      if (!validUuid(materialId) || !(file instanceof File) || file.size < 1 || file.size > MAX_FILE_BYTES ||
          !validText(file.name, 255, 1)) return bad('파일은 20MB 이하로 선택해 주세요.', origin);
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      if (!extensions.has(extension)) return bad('지원하지 않는 파일 형식입니다.', origin);
      const material = one(await db('study_materials', 'GET', `?id=eq.${materialId}&select=id,room_id`));
      if (!material) return bad('자료를 찾을 수 없습니다.', origin, 404);
      const path = `${material.room_id}/${material.id}/${crypto.randomUUID()}.${extension}`;
      const mime = safeMime[extension] || 'application/octet-stream';
      const { error: uploadError } = await storage.upload(path, file, { contentType: mime, upsert: false, cacheControl: '0' });
      if (uploadError) throw uploadError;
      try {
        const attachment = one(await db('study_attachments', 'POST', '', { room_id: material.room_id, material_id: material.id,
          storage_path: path, display_name: file.name, mime_type: mime, size_bytes: file.size }));
        return reply({ attachment: { id: attachment.id, material_id: attachment.material_id, display_name: attachment.display_name,
          mime_type: attachment.mime_type, size_bytes: attachment.size_bytes, created_at: attachment.created_at } }, 200, origin);
      } catch (error) { await storage.remove([path]); throw error; }
    } catch (error) { console.error(error); return bad('파일을 업로드하지 못했습니다.', origin, 500); }
  }
  let data: Record<string, any>;
  try { data = await req.json(); } catch { return bad('요청 형식이 올바르지 않습니다.', origin); }
  const action = data.action;
  try {
    if (action === 'owner.setup') {
      if (typeof data.code !== 'string' || !/^[a-f0-9]{48}$/.test(data.code) ||
          typeof data.password !== 'string' || data.password.length < 10 || data.password.length > 128) {
        return bad('설정 코드와 10자 이상 비밀번호를 확인해 주세요.', origin);
      }
      const setup = one(await db('owner_setup', 'GET', '?id=eq.true&select=code_hash,used_at'));
      if (!setup || setup.used_at || await sha256(data.code) !== setup.code_hash) return bad('설정 코드가 유효하지 않습니다.', origin, 403);
      const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ email: OWNER_EMAIL, password: data.password, email_confirm: true }),
      });
      if (!created.ok) {
        console.error('Owner setup failed', created.status, (await created.text()).slice(0, 200));
        return bad('관리자 계정을 만들지 못했습니다. 지원이 필요합니다.', origin, 500);
      }
      await db('owner_setup', 'PATCH', '?id=eq.true&used_at=is.null', { used_at: new Date().toISOString() });
      return reply({ ok: true }, 200, origin);
    }
    if (action === 'visit') {
      if (typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token)) return bad('올바르지 않은 공유 링크입니다.', origin);
      const share = await activeShare(data.token);
      if (!share) return bad('만료되었거나 사용할 수 없는 링크입니다.', origin, 403);
      const room = one(await db('study_rooms', 'GET', `?id=eq.${share.room_id}&select=id,title,description`));
      if (!room) return bad('프로젝트를 찾을 수 없습니다.', origin, 404);
      let materials = await db('study_materials', 'GET', `?room_id=eq.${share.room_id}&select=id,title,subject,exam_type,summary,content,source_url,quiz_items,created_at&order=created_at.desc`);
      if (Array.isArray(share.material_ids)) materials = materials.filter((m: any) => share.material_ids.includes(m.id));
      if (!share.can_practice) materials = materials.map((m: any) => ({ ...m, quiz_items: [] }));
      let attachments = await db('study_attachments', 'GET', `?room_id=eq.${share.room_id}&select=id,material_id,display_name,mime_type,size_bytes,created_at&order=created_at.asc`);
      const visibleIds = new Set(materials.map((m: any) => m.id));
      attachments = attachments.filter((a: any) => visibleIds.has(a.material_id));
      return reply({ room, materials, attachments, can_practice: share.can_practice }, 200, origin);
    }
    if (action === 'attachment.preview') {
      if (!validUuid(data.id)) return bad('파일 ID가 올바르지 않습니다.', origin);
      const attachment = one(await db('study_attachments', 'GET', `?id=eq.${data.id}&select=*`));
      if (!attachment) return bad('파일을 찾을 수 없습니다.', origin, 404);
      if (!previewMime.has(attachment.mime_type)) return bad('이 파일 형식은 웹 미리보기를 지원하지 않습니다.', origin, 415);
      if (data.token) {
        const share = await activeShare(data.token);
        if (!share || share.room_id !== attachment.room_id ||
            (Array.isArray(share.material_ids) && !share.material_ids.includes(attachment.material_id))) {
          return bad('이 파일에 접근할 수 없습니다.', origin, 403);
        }
      } else if (!await owner(req)) return bad('관리자 로그인이 필요합니다.', origin, 401);
      const { data: file, error } = await storage.download(attachment.storage_path);
      if (error || !file) return bad('파일을 열 수 없습니다.', origin, 500);
      return new Response(file, { status: 200, headers: { ...headers(origin), 'content-type': attachment.mime_type,
        'content-disposition': 'inline', 'cache-control': 'private, no-store', 'pragma': 'no-cache',
        'x-content-type-options': 'nosniff' } });
    }

    if (!await owner(req)) return bad('관리자 로그인이 필요합니다.', origin, 401);
    if (action === 'dashboard') {
      const [rooms, materials, shares, attachments] = await Promise.all([
        db('study_rooms', 'GET', '?select=*&order=created_at.desc'),
        db('study_materials', 'GET', '?select=*&order=created_at.desc'),
        db('study_shares', 'GET', '?select=id,room_id,label,material_ids,can_practice,enabled,expires_at,created_at&order=created_at.desc'),
        db('study_attachments', 'GET', '?select=id,room_id,material_id,display_name,mime_type,size_bytes,created_at&order=created_at.asc'),
      ]);
      return reply({ rooms, materials, shares, attachments }, 200, origin);
    }
    if (action === 'room.create') {
      if (!validText(data.title, 100, 1) || !validText(data.description ?? '', 500)) return bad('프로젝트 내용을 확인해 주세요.', origin);
      return reply({ room: one(await db('study_rooms', 'POST', '', { title: data.title.trim(), description: (data.description ?? '').trim() })) }, 200, origin);
    }
    if (action === 'room.delete') {
      if (!validUuid(data.id)) return bad('프로젝트 ID가 올바르지 않습니다.', origin);
      const attachments = await db('study_attachments', 'GET', `?room_id=eq.${data.id}&select=storage_path`);
      await removeFiles(attachments.map((a: any) => a.storage_path));
      await db('study_rooms', 'DELETE', `?id=eq.${data.id}`);
      return reply({ ok: true }, 200, origin);
    }
    if (action === 'material.create' || action === 'material.update') {
      if (!validUuid(data.room_id) || !validText(data.title, 160, 1) || !validText(data.subject, 60, 1) ||
          !['수행평가', '지필고사', '기타'].includes(data.exam_type) || !validText(data.summary ?? '', 300) ||
          !validText(data.content ?? '', 50000) || (data.source_url && (!validText(data.source_url, 2000) || !/^https?:\/\//i.test(data.source_url))) ||
          !Array.isArray(data.quiz_items) || data.quiz_items.length > 30 ||
          !data.quiz_items.every((q: any) => validText(q.question, 300, 1) && validText(q.answer, 500, 1))) {
        return bad('자료 내용을 확인해 주세요.', origin);
      }
      const item = { room_id: data.room_id, title: data.title.trim(), subject: data.subject.trim(), exam_type: data.exam_type,
        summary: (data.summary ?? '').trim(), content: (data.content ?? '').trim(), source_url: data.source_url || null,
        quiz_items: data.quiz_items.map((q: any) => ({ question: q.question.trim(), answer: q.answer.trim() })), updated_at: new Date().toISOString() };
      if (action === 'material.update') {
        if (!validUuid(data.id)) return bad('자료 ID가 올바르지 않습니다.', origin);
        return reply({ material: one(await db('study_materials', 'PATCH', `?id=eq.${data.id}`, item)) }, 200, origin);
      }
      return reply({ material: one(await db('study_materials', 'POST', '', item)) }, 200, origin);
    }
    if (action === 'material.delete') {
      if (!validUuid(data.id)) return bad('자료 ID가 올바르지 않습니다.', origin);
      const attachments = await db('study_attachments', 'GET', `?material_id=eq.${data.id}&select=storage_path`);
      await removeFiles(attachments.map((a: any) => a.storage_path));
      await db('study_materials', 'DELETE', `?id=eq.${data.id}`);
      return reply({ ok: true }, 200, origin);
    }
    if (action === 'attachment.delete') {
      if (!validUuid(data.id)) return bad('파일 ID가 올바르지 않습니다.', origin);
      const attachment = one(await db('study_attachments', 'GET', `?id=eq.${data.id}&select=storage_path`));
      if (!attachment) return bad('파일을 찾을 수 없습니다.', origin, 404);
      await removeFiles([attachment.storage_path]);
      await db('study_attachments', 'DELETE', `?id=eq.${data.id}`);
      return reply({ ok: true }, 200, origin);
    }
    if (action === 'share.create') {
      if (!validUuid(data.room_id) || !validText(data.label, 80, 1) || !Array.isArray(data.material_ids) ||
          !data.material_ids.every(validUuid) || data.material_ids.length > 200) return bad('공유 설정을 확인해 주세요.', origin);
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      const share = one(await db('study_shares', 'POST', '', { room_id: data.room_id, label: data.label.trim(), token_hash: await sha256(token),
        material_ids: data.material_ids.length ? data.material_ids : null, can_practice: !!data.can_practice,
        expires_at: data.expires_at || null }));
      return reply({ share: { ...share, token_hash: undefined }, token }, 200, origin);
    }
    if (action === 'share.disable') {
      if (!validUuid(data.id)) return bad('공유 ID가 올바르지 않습니다.', origin);
      await db('study_shares', 'PATCH', `?id=eq.${data.id}`, { enabled: false });
      return reply({ ok: true }, 200, origin);
    }
    return bad('알 수 없는 작업입니다.', origin, 404);
  } catch (error) {
    console.error(error);
    return bad('요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.', origin, 500);
  }
});
