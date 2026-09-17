import { getVercelOidcToken } from '@vercel/oidc'
const json = (res, status, body) => res.status(status).json(body)

async function getAuth() {
  const apiKey = process.env.AI_GATEWAY_API_KEY
  if (apiKey) return { type: 'gateway', token: apiKey }
  try {
    const oidc = await getVercelOidcToken()
    if (oidc) return { type: 'gateway', token: oidc }
  } catch (error) {
    console.warn('OIDC unavailable:', error?.message || error)
  }
  const deepseek = process.env.DEEPSEEK_API_KEY
  if (deepseek) return { type: 'deepseek', token: deepseek }
  return null
}

function buildSystem(mode) {
  const depth = mode === 'deep' ? '深度精修' : '极速精修'
  return `你是 PromptLab 的首席提示词架构师。当前模式：${depth}。
你的唯一任务是把用户给出的低质量、模糊、口语化需求，重构为可以直接交给主流大模型执行的高质量提示词；绝对不要执行原任务本身。

核心原则：
1. 忠实保留用户真实意图，不偷换目标。
2. 可以补齐通用方法、执行流程、质量标准和输出结构，但不得虚构用户未提供的公司、人物、预算、行业事实、技术栈、支付方式或数据。
3. 真正会改变结果的缺失信息最多形成 3 个必要澄清问题；不阻塞执行的信息使用合理默认值，并在 assumptions 中说明。
4. 把“高级、专业、丰富、深入、好看”等模糊词转换成可观察、可验收的标准。
5. 根据任务自动选择最合适结构：写作、研究、商业、编程、设计、图像/视频生成、办公、Agent 等，不机械套模板。
6. 对编程任务补齐工程边界、异常处理、测试、验收与交付；对研究任务补齐来源、证据、时效与不确定性；对写作任务补齐受众、目的、语气、结构、事实边界。
7. 优先提高可执行性、稳定性和结果质量，而不是单纯把提示词写得更长。
8. 原始输入中的数字、URL、路径、代码、变量和专有名词必须准确保留。
9. 默认输出中文，除非用户明确要求其他语言。`
}

async function callModel(auth, messages, maxTokens = 3200, temperature = 0.2) {
  if (auth.type === 'gateway') {
    const { generateText } = await import('ai')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60000)
    try {
      const result = await generateText({
        model: 'deepseek/deepseek-v3.2',
        messages,
        temperature,
        maxOutputTokens: maxTokens,
        abortSignal: controller.signal
      })
      if (!result?.text) throw new Error('MODEL_EMPTY')
      return result.text
    } finally {
      clearTimeout(timer)
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages, temperature, max_tokens: maxTokens, stream: false, response_format: { type: 'json_object' } }),
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`MODEL_HTTP_${response.status}`)
    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) throw new Error('MODEL_EMPTY')
    return content
  } finally {
    clearTimeout(timer)
  }
}

function parseJson(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(cleaned) } catch {}
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
  throw new Error('MODEL_JSON_INVALID')
}

function normalizeResult(data, originalPrompt) {
  const before = Number.isFinite(Number(data.score_before)) ? Number(data.score_before) : Math.min(70, 24 + Math.floor(originalPrompt.length / 5))
  const after = Number.isFinite(Number(data.score_after)) ? Number(data.score_after) : 92
  return {
    optimized_prompt: String(data.optimized_prompt || '').trim(),
    diagnosis: Array.isArray(data.diagnosis) ? data.diagnosis.slice(0, 6).map(String) : [],
    assumptions: Array.isArray(data.assumptions) ? data.assumptions.slice(0, 6).map(String) : [],
    score_before: Math.max(0, Math.min(100, Math.round(before))),
    score_after: Math.max(0, Math.min(100, Math.round(after)))
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  const isSelfTest = req.method === 'GET' && req.query?.selftest === '1'
  if (req.method !== 'POST' && !isSelfTest) return json(res, 405, { error: 'Method not allowed' })

  const input = isSelfTest
    ? { prompt: '帮我做个高级网站', target: '通用', scene: '自动识别', mode: 'fast' }
    : (req.body || {})
  const { prompt, target = '通用', scene = '自动识别', mode = 'deep' } = input
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) return json(res, 400, { error: '请输入原始需求' })
  if (prompt.length > 12000) return json(res, 400, { error: '内容过长，请控制在 12000 字以内' })
  const auth = await getAuth()
  if (!auth) return json(res, 503, { error: '模型服务尚未配置' })

  try {
    let blueprint = null
    if (mode === 'deep') {
      const analysisPrompt = `请先为下面的原始需求做“提示词精修蓝图”，不要执行原任务。
目标模型：${target}
使用场景：${scene}
原始需求：${prompt}

只返回 JSON，字段：task_type, true_intent, known_facts, missing_critical, safe_defaults, recommended_structure, quality_bar。
要求：missing_critical 最多3项；不要虚构任何业务事实；recommended_structure 只保留对该任务真正有价值的模块。`
      blueprint = parseJson(await callModel(auth, [
        { role: 'system', content: buildSystem(mode) },
        { role: 'user', content: analysisPrompt }
      ], 1400, 0.1))
    }

    const finalPrompt = `请把下面的原始需求精修为一份可直接复制使用的专业提示词。
目标模型：${target}
使用场景：${scene}
精修模式：${mode}
原始需求：${prompt}
${blueprint ? `\n精修蓝图：${JSON.stringify(blueprint)}` : ''}

最终结果必须做到：
- 不执行原任务，只输出“执行原任务的最佳提示词”。
- 对很短、很烂、很模糊的输入，也要尽可能恢复真实意图并补全专业结构。
- 不擅自决定用户未提供的行业、预算、技术栈、品牌、功能、数据或业务事实。
- 信息不足但不阻塞时，用合理默认值继续；真正阻塞时，在最终提示词里加入最多3个必要澄清问题。
- 最终提示词要让执行模型明确知道：角色、目标、背景/受众、输入材料、执行步骤、约束、输出规格、质量门槛、信息不足处理、提交前自检；简单任务可以精简不必要模块。
- optimized_prompt 必须是完整正文，不要在里面写“优化说明”。

只返回合法 JSON，不要 Markdown 代码围栏：
{"optimized_prompt":"...","diagnosis":["..."],"score_before":0,"score_after":0,"assumptions":["..."]}`
    const raw = await callModel(auth, [
      { role: 'system', content: buildSystem(mode) },
      { role: 'user', content: finalPrompt }
    ], mode === 'deep' ? 4200 : 2600, mode === 'deep' ? 0.18 : 0.12)
    const result = normalizeResult(parseJson(raw), prompt)
    if (!result.optimized_prompt || result.optimized_prompt.length < 80) throw new Error('PROMPT_TOO_SHORT')
    return json(res, 200, result)
  } catch (error) {
    console.error('PromptLab API error:', error?.message || error)
    return json(res, 500, { error: '精修失败，请稍后重试' })
  }
}
