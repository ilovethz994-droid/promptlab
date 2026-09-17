<template>
  <main class="app-shell">
    <header class="topbar">
      <div class="brand"><span class="logo">P</span><div><strong>PromptLab</strong><small>提示词精修器</small></div></div>
      <span class="badge">不会写 Prompt 也能用</span>
    </header>

    <section class="hero">
      <p class="eyebrow">PROMPT REFINERY</p>
      <h1>一句烂需求<br><em>变成专业 Prompt</em></h1>
      <p class="sub">不用学提示词工程。直接写人话，自动补齐角色、目标、步骤、约束、输出格式与验收标准。</p>
      <div class="model-strip"><span>ChatGPT</span><span>Claude</span><span>DeepSeek</span><span>Gemini</span><span>Cursor</span></div>
    </section>

    <section class="workspace">
      <article class="panel input-panel">
        <div class="panel-head"><div><span class="step">01</span><strong>你的原始需求</strong></div><span>{{ prompt.length }}/12000</span></div>
        <textarea v-model="prompt" maxlength="12000" placeholder="直接写人话就行。例如：帮我做个高级网站，要有质感，最好能直接上线。"></textarea>
        <div class="examples"><button v-for="item in examples" :key="item" @click="prompt=item">{{ item }}</button></div>
        <div class="access-row"><label>访问码<input v-model.trim="accessCode" autocomplete="off" placeholder="购买后获得的访问码" /></label><span v-if="remaining !== null">剩余 <b>{{ remaining }}</b> 次</span></div>
        <div class="options">
          <label>目标模型<select v-model="target"><option v-for="x in targets" :key="x">{{ x }}</option></select></label>
          <label>使用场景<select v-model="scene"><option v-for="x in scenes" :key="x">{{ x }}</option></select></label>
          <label>精修强度<select v-model="mode"><option value="fast">极速精修</option><option value="deep">深度精修</option></select></label>
        </div>
        <button class="primary" :disabled="loading || !prompt.trim() || !accessCode.trim()" @click="optimize">
          <span v-if="loading" class="spinner"></span>{{ loading ? '正在精修...' : '一键精修' }}
        </button>
        <p class="hint">访问码只需输入一次，本浏览器会自动记住。原始表达可以很简单，PromptLab 会负责把它整理成可执行指令。</p>
        <p v-if="error" class="error">{{ error }}</p>
      </article>

      <article class="panel output-panel">
        <div class="panel-head"><div><span class="step">02</span><strong>专业提示词</strong></div><button class="copy" :disabled="!result.optimized_prompt" @click="copyResult">{{ copied ? '已复制' : '复制' }}</button></div>
        <div v-if="!result.optimized_prompt" class="empty">
          <div class="spark">✦</div><strong>精修结果会出现在这里</strong>
          <p>不是单纯把提示词写长，而是让模型真正知道要做什么、做到什么程度。</p>
        </div>
        <template v-else>
          <div class="score-row"><span>原始结构 <b>{{ result.score_before }}</b></span><i>→</i><span>精修后结构 <b class="good">{{ result.score_after }}</b></span></div>          <pre class="result">{{ result.optimized_prompt }}</pre>
          <div class="meta-grid">
            <div><strong>原提示词的问题</strong><ul><li v-for="x in result.diagnosis" :key="x">{{ x }}</li></ul></div>
            <div><strong>本次精修处理</strong><ul><li v-for="x in result.assumptions" :key="x">{{ x }}</li></ul></div>
          </div>
        </template>
      </article>
    </section>

    <section class="trust"><span>✓ 模糊输入可用</span><span>✓ 不擅自编造业务事实</span><span>✓ 直接复制到主流 AI</span></section>
    <footer>PromptLab · 基于开源 Prompt Optimizer 改造 · <a href="https://github.com/ilovethz994-droid/promptlab" target="_blank" rel="noopener">AGPL-3.0 源码</a><br><small>输入内容会发送至模型服务处理；本站默认不持久化保存你的提示词正文。</small></footer>
  </main>
</template>

<script setup>
import { reactive, ref } from 'vue'
const prompt = ref('')
const target = ref('通用')
const scene = ref('自动识别')
const mode = ref('deep')
const loading = ref(false)
const error = ref('')
const copied = ref(false)
const accessCode = ref(localStorage.getItem('promptlab_access_code') || '')
const savedRemaining = localStorage.getItem('promptlab_remaining')
const remaining = ref(savedRemaining === null ? null : Number(savedRemaining))
const result = reactive({ optimized_prompt:'', diagnosis:[], assumptions:[], score_before:0, score_after:0 })
const targets = ['通用','ChatGPT','Claude','DeepSeek','Gemini','Cursor / Claude Code']
const scenes = ['自动识别','编程开发','商业分析','内容写作','深度研究','办公效率','图片生成','视频生成']
const examples = ['帮我做个高级网站','写一条能爆的小红书','分析一下这个创业项目']

function diagnose(text){
  const items=[]
  if(text.trim().length<30) items.push('信息量较少，目标与边界不够明确')
  if(!/(用户|客户|受众|读者|人群|给谁|面向)/.test(text)) items.push('没有明确目标受众或使用者')
  if(!/(格式|字数|页面|表格|JSON|代码|输出|交付)/i.test(text)) items.push('没有明确最终交付格式')
  if(!/(不要|必须|限制|预算|时间|禁止|要求)/.test(text)) items.push('缺少约束与验收边界')
  return items.length ? items : ['原始需求已有一定结构，主要进行专业化与可执行性增强']
}
function score(text){
  let s=24 + Math.min(26,Math.floor(text.trim().length/8))
  if(/目标|目的|希望|需要/.test(text)) s+=8
  if(/用户|客户|受众|读者|人群/.test(text)) s+=8
  if(/格式|输出|交付|代码|表格|JSON/i.test(text)) s+=10
  if(/必须|不要|限制|要求|禁止/.test(text)) s+=10
  return Math.min(78,s)
}

function systemPrompt(){
  const depth = mode.value==='deep' ? '深度精修：完整重建任务结构' : '极速精修：保留简洁但显著提升可执行性'
  return `你是 PromptLab 高级提示词架构师。你的唯一任务是把用户的原始需求改写成一份可直接交给主流 AI 执行的专业提示词。

目标模型：${target.value}
使用场景：${scene.value}
精修模式：${depth}

规则：
1. 忠实保留用户真实意图，不擅自改变任务目标。
2. 自动补齐角色、目标、背景、执行步骤、约束、输出格式、质量标准和验收条件。
3. 不得虚构用户未提供的公司、预算、行业、技术栈、支付方式、人物或业务事实。
4. 不影响执行的细节可给合理默认值；真正会改变结果的关键信息，写成最多3个必要澄清问题。
5. 把“高级、专业、好看、深入”等模糊词转为可观察、可验收标准。
6. 不解释你如何优化，不执行原始任务，只输出最终优化后的提示词正文。
7. 原始输入中的数字、URL、代码、路径、专有名词必须保留。`
}

async function optimize(){
  error.value=''; copied.value=false; loading.value=true
  Object.assign(result,{optimized_prompt:'',diagnosis:[],assumptions:[],score_before:0,score_after:0})
  try{
    localStorage.setItem('promptlab_access_code',accessCode.value.trim())
    const requestId=crypto.randomUUID()
    const r=await fetch('/api/promptlab',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:prompt.value,target:target.value,scene:scene.value,mode:mode.value,access_code:accessCode.value.trim(),request_id:requestId})})
    const data=await r.json()
    if(!r.ok) throw new Error(data?.error||'精修失败')
    Object.assign(result,data)
    if(Number.isFinite(Number(data.remaining))){remaining.value=Number(data.remaining);localStorage.setItem('promptlab_remaining',String(remaining.value))}
  }catch(e){ error.value=e?.message||'精修失败，请稍后重试' }
  finally{ loading.value=false }
}
async function copyResult(){
  if(!result.optimized_prompt) return
  await navigator.clipboard.writeText(result.optimized_prompt)
  copied.value=true
  setTimeout(()=>copied.value=false,1600)
}
</script>

<style>
:root{font-family:Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:#171717;background:#f5f3ef;font-synthesis:none}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:radial-gradient(circle at 20% 0,#fff 0,#f5f2ec 42%,#eee8de 100%)}
button,select,textarea{font:inherit}
.app-shell{max-width:1260px;margin:auto;padding:28px 32px 36px}
.topbar{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:11px}.brand>div{display:grid}.brand strong{font-size:18px}.brand small{color:#777;font-size:11px}
.logo{width:38px;height:38px;border-radius:12px;background:#171717;color:#fff;display:grid;place-items:center;font-weight:800;box-shadow:0 8px 24px #0002}
.badge{font-size:12px;background:#fff;border:1px solid #ded9d0;padding:8px 12px;border-radius:999px;color:#666}
.hero{text-align:center;max-width:900px;margin:62px auto 40px}.eyebrow{font-weight:800;font-size:12px;color:#8a7650;letter-spacing:.15em}
.hero h1{font-size:clamp(44px,6vw,74px);line-height:1.02;letter-spacing:-.055em;margin:12px 0 20px}.hero h1 em{font-style:normal;color:#776641}
.sub{font-size:17px;line-height:1.7;color:#716c65;max-width:720px;margin:auto}.model-strip{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:22px}.model-strip span{font-size:11px;padding:6px 10px;border-radius:999px;background:#fff8;border:1px solid #ded8ce}.workspace{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:stretch}
.panel{background:#ffffffdf;border:1px solid #ded9d0;border-radius:24px;box-shadow:0 16px 50px #463a2712;backdrop-filter:blur(16px);padding:20px;min-height:610px}
.panel-head{display:flex;justify-content:space-between;align-items:center;color:#8a857e;font-size:12px;margin-bottom:16px}.panel-head>div{display:flex;align-items:center;gap:9px;color:#222;font-size:15px}
.step{font-size:10px;border:1px solid #d8d2c8;border-radius:999px;padding:4px 7px;color:#877c68}
textarea{width:100%;height:265px;resize:none;border:1px solid #e4dfd7;border-radius:16px;background:#faf9f6;padding:18px;font-size:16px;line-height:1.7;outline:none;transition:.2s}
textarea:focus{border-color:#998b6d;box-shadow:0 0 0 3px #9c8c6d18}
.examples{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 18px}.examples button,.copy{border:1px solid #ded9d0;background:#fff;border-radius:999px;padding:8px 11px;font-size:12px;cursor:pointer;color:#555}
.access-row{display:flex;align-items:end;justify-content:space-between;gap:12px;margin:0 0 14px}.access-row label{flex:1;font-size:11px;color:#777}.access-row input{margin-top:5px;width:100%;border:1px solid #ded9d0;background:#faf9f6;border-radius:10px;padding:10px;color:#333;outline:none}.access-row input:focus{border-color:#998b6d;box-shadow:0 0 0 3px #9c8c6d18}.access-row span{white-space:nowrap;font-size:12px;color:#6d685f;padding:10px 2px}.access-row b{color:#171717;font-size:15px}
.options{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.options label{font-size:11px;color:#777}.options select{margin-top:5px;width:100%;border:1px solid #ded9d0;background:#faf9f6;border-radius:10px;padding:10px;color:#333}
.primary{width:100%;margin-top:18px;border:0;border-radius:14px;padding:15px 18px;background:#171717;color:#fff;font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 10px 28px #0002}.primary:disabled{opacity:.48;cursor:not-allowed}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid #fff5;border-top-color:#fff;border-radius:50%;vertical-align:-2px;margin-right:8px;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.hint{font-size:11px;color:#999;text-align:center}.error{font-size:12px;color:#b63b30;text-align:center}.output-panel{display:flex;flex-direction:column}
.empty{flex:1;display:grid;place-items:center;text-align:center;align-content:center;color:#858078;padding:44px}.empty .spark{font-size:42px;color:#9a8965;margin-bottom:12px}.empty strong{color:#333;font-size:18px}.empty p{max-width:390px;line-height:1.7}
.score-row{display:flex;align-items:center;gap:12px;background:#faf9f6;border:1px solid #e5dfd5;border-radius:12px;padding:11px 13px;font-size:12px;color:#777}.score-row b{font-size:18px;color:#555;margin-left:5px}.score-row .good{color:#5d7440}.score-row i{font-style:normal;color:#aaa}
.result{white-space:pre-wrap;word-break:break-word;flex:1;max-height:390px;overflow:auto;background:#151515;color:#f5f1e9;border-radius:15px;padding:18px;line-height:1.65;font-size:13px;margin:12px 0}.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.meta-grid>div{background:#faf9f6;border:1px solid #e5dfd5;border-radius:12px;padding:12px}.meta-grid strong{font-size:12px}.meta-grid ul{padding-left:18px;margin:8px 0 0;color:#68645e;font-size:11px;line-height:1.6}
.trust{display:flex;justify-content:center;gap:30px;flex-wrap:wrap;margin:26px auto;color:#716b62;font-size:12px}.copy:disabled{opacity:.4;cursor:not-allowed}
footer{text-align:center;color:#989188;font-size:11px;padding-top:8px}
@media(max-width:840px){.app-shell{padding:20px 14px}.hero{margin:42px auto 28px}.workspace{grid-template-columns:1fr}.options{grid-template-columns:1fr}.panel{min-height:auto}.hero h1{font-size:44px}.badge{display:none}}
</style>