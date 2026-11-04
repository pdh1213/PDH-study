const SUPABASE_URL = 'https://ithhcfljgcjujaimbuea.supabase.co';
const PUBLIC_KEY = 'sb_publishable_glMrPVCLnA5B6ReWImkOvQ_cZ8NTf6K';
const OWNER_EMAIL = 'iddadada1213@naver.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 사용할 수 있습니다.' });
  const jwt = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!jwt) return res.status(401).json({ error: '관리자 로그인이 필요합니다.' });
  try {
    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: PUBLIC_KEY, authorization: `Bearer ${jwt}` } });
    if (!userResponse.ok) return res.status(401).json({ error: '로그인이 만료되었습니다.' });
    const user = await userResponse.json();
    if (user.email?.toLowerCase() !== OWNER_EMAIL || !user.email_confirmed_at) return res.status(403).json({ error: '관리자만 사용할 수 있습니다.' });
    const { title, content } = req.body || {};
    if (typeof content !== 'string' || content.trim().length < 30 || content.length > 18000 || typeof title !== 'string' || title.length > 160) {
      return res.status(400).json({ error: '자료 내용을 30~18,000자로 입력해 주세요.' });
    }
    const token = req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY;
    if (!token) return res.status(503).json({ error: 'AI 연결이 아직 설정되지 않았습니다.' });
    const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4.1-mini',
        response_format: { type: 'json_object' },
        max_tokens: 1400,
        messages: [
          { role: 'system', content: '너는 한국 중고등학생을 위한 학습 조교다. 제공된 자료에 있는 사실만 사용하여 한국어로 핵심 요약(300자 이내)과 암기용 질문 5개를 만들어라. 자료에 없는 사실을 만들어내지 마라. JSON 객체 하나만 반환하라: {"summary":"...","quiz_items":[{"question":"...","answer":"..."}]}' },
          { role: 'user', content: `제목: ${title}\n\n자료:\n${content}` },
        ],
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { console.error('AI Gateway error', response.status, result?.error?.message); return res.status(502).json({ error: 'AI 생성이 잠시 불가능합니다. 다시 시도해 주세요.' }); }
    const generated = JSON.parse(result.choices?.[0]?.message?.content || '{}');
    const quiz_items = Array.isArray(generated.quiz_items) ? generated.quiz_items.filter(q => typeof q.question === 'string' && typeof q.answer === 'string').slice(0, 8).map(q => ({ question: q.question.slice(0, 300), answer: q.answer.slice(0, 500) })) : [];
    if (!generated.summary || !quiz_items.length) return res.status(502).json({ error: 'AI 결과를 확인하지 못했습니다. 다시 시도해 주세요.' });
    return res.status(200).json({ summary: String(generated.summary).slice(0, 300), quiz_items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'AI 요청을 처리하지 못했습니다.' });
  }
}

