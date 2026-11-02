/**
 * 把用户此刻在电脑上做什么（前台窗口、空闲时长、QQ音乐在放的歌）注入给模型，
 * 通过 HTTP 暴露给侧栏小组件，记录最近几天的状态，并可按设置的间隔在挂机时叫醒模型。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const name = 'user-status'
const inject = ['subprocess', 'systemPrompt', 'tools', 'webServer', 'agents']

const STATUS_FILE = join(tmpdir(), 'dsh-user-status.json')
const SETTINGS_FILE = join(tmpdir(), 'dsh-user-status-settings.json')
const HISTORY_FILE = join(tmpdir(), 'dsh-user-status-history.json')
const COLLECTOR_SCRIPT = fileURLToPath(new URL('./collector.ps1', import.meta.url))
const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
const STALE_SECONDS = 20
const IDLE_AFTER_SECONDS = 300
const DEFAULT_HISTORY_DAYS = 3
const MAX_HISTORY_SAMPLES = 3000

// 这些程序在前台时，窗口标题一律不报，只说应用名。
const PRIVATE_PROCESS = /^(qq|tim|wechat|weixin|wechatappex|telegram|discord|feishu|lark|dingtalk|slack|outlook|foxmail|1password|bitwarden|keepass|lastpass|credential)/i
const PRIVATE_TITLE = /密码|验证码|银行|身份证|支付宝|支付|无痕|inprivate|密码管理器|信用卡/i

// 隐私程序只露应用名，不露窗口标题。
const APP_NAMES = {
  qq: 'QQ',
  tim: 'TIM',
  wechat: '微信',
  weixin: '微信',
  wechatappex: '微信',
  telegram: 'Telegram',
  discord: 'Discord',
  feishu: '飞书',
  lark: '飞书',
  dingtalk: '钉钉',
  slack: 'Slack',
  outlook: 'Outlook',
  foxmail: 'Foxmail',
  '1password': '1Password',
  bitwarden: 'Bitwarden',
  keepass: 'KeePass',
  lastpass: 'LastPass',
}

function isPrivate(processName, title) {
  return PRIVATE_PROCESS.test(processName || '') || PRIVATE_TITLE.test(title || '')
}

function isDshWindow(processName, title) {
  return /^electron$/i.test(processName || '') && /DSH/i.test(title || '')
}

function friendlyName(processName) {
  const raw = String(processName || '').trim()
  if (!raw) return '隐私程序'
  return APP_NAMES[raw.toLowerCase()] || raw
}

function readStatus() {
  try {
    const data = JSON.parse(readFileSync(STATUS_FILE, 'utf8'))
    return data && typeof data === 'object' ? data : null
  } catch {
    return null
  }
}

function ageSeconds(data) {
  return data && typeof data.ts === 'number'
    ? (Date.now() - data.ts) / 1000
    : Number.POSITIVE_INFINITY
}

function clampWakeMinutes(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.max(5, Math.min(1440, Math.round(n)))
}

function clampHistoryDays(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_HISTORY_DAYS
  return Math.max(1, Math.min(30, Math.round(n)))
}

function readSettings() {
  try {
    const raw = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'))
    const rawMode = raw?.historyMode
    return {
      wakeMinutes: clampWakeMinutes(raw?.wakeMinutes),
      historyDays: clampHistoryDays(raw?.historyDays ?? DEFAULT_HISTORY_DAYS),
      historyMode: rawMode === 'full' ? 'full' : rawMode === 'summary' ? 'summary' : 'off',
    }
  } catch {
    return { wakeMinutes: 0, historyDays: DEFAULT_HISTORY_DAYS, historyMode: 'off' }
  }
}

function writeSettings(settings) {
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings), 'utf8')
}

function readHistory() {
  try {
    const raw = JSON.parse(readFileSync(HISTORY_FILE, 'utf8'))
    return { samples: Array.isArray(raw?.samples) ? raw.samples : [] }
  } catch {
    return { samples: [] }
  }
}

function writeHistory(history) {
  writeFileSync(HISTORY_FILE, JSON.stringify(history), 'utf8')
}

function appendSample(sample) {
  const { historyDays } = readSettings()
  const cutoff = Date.now() - historyDays * 86400000
  const history = readHistory()
  const samples = history.samples.filter((entry) => typeof entry?.ts === 'number' && entry.ts >= cutoff)
  const last = samples[samples.length - 1]
  if (
    last
    && last.app === sample.app
    && last.title === sample.title
    && last.music === sample.music
    && last.hidden === sample.hidden
    && last.idle === sample.idle
  ) {
    return
  }
  samples.push(sample)
  writeHistory({ samples: samples.slice(-MAX_HISTORY_SAMPLES) })
}

function aggregateHistory(samples, now) {
  const byApp = new Map()
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i]
    if (!sample || typeof sample.ts !== 'number') continue
    const next = samples[i + 1]
    const start = sample.ts
    const end = Math.min(next && typeof next.ts === 'number' ? next.ts : now, now)
    const duration = Math.max(0, end - start)
    const key = sample.app || '未知'
    let entry = byApp.get(key)
    if (!entry) {
      entry = { app: key, ms: 0, firstTs: start, lastTs: end }
      byApp.set(key, entry)
    }
    entry.ms += duration
    if (start < entry.firstTs) entry.firstTs = start
    if (end > entry.lastTs) entry.lastTs = end
  }
  return [...byApp.values()]
    .map((entry) => ({
      app: entry.app,
      minutes: Math.round(entry.ms / 60000),
      firstTs: entry.firstTs,
      lastTs: entry.lastTs,
    }))
    .filter((entry) => entry.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
}

function formatMinutes(minutes) {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`
    : `${minutes}m`
}

function dateKey(ts) {
  const date = new Date(ts)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function aggregateByDay(samples, now) {
  const byDay = new Map()
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i]
    if (!sample || typeof sample.ts !== 'number') continue
    const next = samples[i + 1]
    const start = sample.ts
    const end = Math.min(next && typeof next.ts === 'number' ? next.ts : now, now)
    const duration = Math.max(0, end - start)
    if (duration < 60000) continue
    const key = dateKey(start)
    let apps = byDay.get(key)
    if (!apps) {
      apps = new Map()
      byDay.set(key, apps)
    }
    const appKey = sample.app || '未知'
    let entry = apps.get(appKey)
    if (!entry) {
      entry = { ms: 0, first: start, last: end }
      apps.set(appKey, entry)
    }
    entry.ms += duration
    if (start < entry.first) entry.first = start
    if (end > entry.last) entry.last = end
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, apps]) => {
      const parts = [...apps.entries()]
        .sort((a, b) => b[1].ms - a[1].ms)
        .slice(0, 6)
        .map(([appName, value]) => `${appName} ${formatMinutes(Math.round(value.ms / 60000))}`)
      return `${day}：${parts.join('、')}`
    })
}

function buildPayload(data) {  const fg = data?.foreground || {}
  const hidden = isPrivate(fg.process, fg.title)
  const stale = ageSeconds(data) > STALE_SECONDS
  const settings = readSettings()
  return {
    ok: Boolean(data) && !stale,
    stale,
    foreground: {
      process: fg.process || '',
      appName: hidden ? friendlyName(fg.process) : '',
      title: hidden ? '' : fg.title || '',
      hidden,
      isDsh: isDshWindow(fg.process, fg.title),
    },
    idleSeconds: typeof data?.idleSec === 'number' ? data.idleSec : -1,
    music: typeof data?.music?.title === 'string' ? data.music.title.trim() : '',
    wakeMinutes: settings.wakeMinutes,
    historyDays: settings.historyDays,
    historyMode: settings.historyMode,
  }
}

function describeForPrompt(data) {
  if (!data) return '用户当前状态：暂时读不到（采集器可能没启动）。'
  if (ageSeconds(data) > STALE_SECONDS) return '用户当前状态：采集器已经停了，数据过期。'

  const fg = data.foreground || {}
  const idleSec = typeof data.idleSec === 'number' ? data.idleSec : -1
  const music = typeof data.music?.title === 'string' ? data.music.title.trim() : ''
  const bits = []

  if (fg.process) {
    if (isPrivate(fg.process, fg.title)) bits.push(`前台是「${friendlyName(fg.process)}」（内容已打码）`)
    else if (isDshWindow(fg.process, fg.title)) bits.push('正在和你说话')
    else if (fg.title) bits.push(`前台是「${fg.title}」（${fg.process}）`)
    else bits.push(`前台是 ${fg.process}`)
  }
  if (idleSec >= 0) {
    if (idleSec < 1) bits.push('刚动过键鼠')
    else if (idleSec < IDLE_AFTER_SECONDS) bits.push(`已经 ${Math.round(idleSec)} 秒没操作`)
    else bits.push(`已经 ${Math.round(idleSec / 60)} 分钟没操作，应该在挂机`)
  }
  if (music) bits.push(`QQ音乐在播「${music}」`)

  let summary = ''
  const settings = readSettings()
  if (settings.historyMode !== 'off') {
    const cutoff = Date.now() - settings.historyDays * 86400000
    const samples = readHistory().samples.filter((entry) => typeof entry?.ts === 'number' && entry.ts >= cutoff)
    if (settings.historyMode === 'summary') {
      const apps = aggregateHistory(samples, Date.now()).slice(0, 5)
      if (apps.length > 0) {
        const parts = apps.map((entry) => `${entry.app} ${formatMinutes(entry.minutes)}`)
        summary = `（最近 ${settings.historyDays} 天常用：${parts.join('、')}）`
      }
    } else {
      const lines = aggregateByDay(samples, Date.now())
      if (lines.length > 0) summary = `（最近 ${settings.historyDays} 天记录：\n${lines.join('\n')}）`
    }
  }

  return `用户当前状态：${bits.join('；')}。${summary}`
}

function wakeMessage(data) {
  const fg = data.foreground || {}
  const music = typeof data.music?.title === 'string' ? data.music.title.trim() : ''
  const idleMin = Math.max(1, Math.round((data.idleSec || 0) / 60))
  let where = ''
  if (fg.process) {
    if (isPrivate(fg.process, fg.title)) where = `前台上是「${friendlyName(fg.process)}」`
    else if (isDshWindow(fg.process, fg.title)) where = '停留在 DSH 这边'
    else if (fg.title) where = `前台是「${fg.title}」`
  }
  const bits = [`（挂机提醒）用户已经 ${idleMin} 分钟没有操作了。`]
  if (where) bits.push(`${where}。`)
  if (music) bits.push(`QQ音乐在播「${music}」。`)
  bits.push('如果你想关心一句，就自然地说；不想说或者觉得打扰，也可以什么都不做。')
  const text = bits.join('')
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: 'user-status',
      form: 'snapshot',
      sections: [{ name: 'user-status', text }],
    },
  }
}

function apply(ctx) {
  ctx.effect(() => {
    const child = ctx.subprocess.spawn({
      argv: [
        POWERSHELL,
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', COLLECTOR_SCRIPT,
        '-StatusPath', STATUS_FILE,
      ],
      cwd: tmpdir(),
      stdio: { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' },
      graceMs: 3000,
    })
    return () => {
      try { child.terminate() } catch {}
    }
  })

  ctx.systemPrompt.context({
    name: 'user-status',
    order: 960,
    text: () => describeForPrompt(readStatus()),
  })

  ctx.effect(() => {
    const routes = []
    routes.push(ctx.webServer.register({
      kind: 'exact',
      path: '/user-status.json',
      handler: (_req, res) => {
        let payload
        try {
          payload = buildPayload(readStatus())
        } catch (error) {
          payload = { ok: false, stale: true, error: String(error) }
        }
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(JSON.stringify(payload))
      },
    }))
    routes.push(ctx.webServer.register({
      kind: 'exact',
      path: '/user-status-settings.json',
      handler: async (req, res) => {
        if (req.method === 'POST') {
          let body = ''
          try {
            for await (const chunk of req) body += chunk
          } catch {}
          let next = readSettings()
          try {
            const parsed = JSON.parse(body || '{}')
            next = {
              wakeMinutes: clampWakeMinutes(parsed?.wakeMinutes ?? next.wakeMinutes),
              historyDays: clampHistoryDays(parsed?.historyDays ?? next.historyDays),
              historyMode: parsed?.historyMode === 'full' ? 'full' : parsed?.historyMode === 'summary' ? 'summary' : 'off',
            }
          } catch {}
          try { writeSettings(next) } catch (error) {
            res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: String(error) }))
            return
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify(next))
          return
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify(readSettings()))
      },
    }))
    routes.push(ctx.webServer.register({
      kind: 'exact',
      path: '/user-status-history.json',
      handler: (_req, res) => {
        const { historyDays } = readSettings()
        const cutoff = Date.now() - historyDays * 86400000
        const samples = readHistory().samples
          .filter((entry) => typeof entry?.ts === 'number' && entry.ts >= cutoff)
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(JSON.stringify({ days: historyDays, apps: aggregateHistory(samples, Date.now()) }))
      },
    }))
    return () => {
      for (const dispose of routes) {
        try { dispose() } catch {}
      }
    }
  })

  let lastWakeAt = 0
  ctx.effect(() => {
    const timer = setInterval(() => {
      try {
        const data = readStatus()
        if (!data || ageSeconds(data) > STALE_SECONDS) return

        const fg = data.foreground || {}
        const hidden = isPrivate(fg.process, fg.title)
        appendSample({
          ts: Date.now(),
          app: hidden ? friendlyName(fg.process) : fg.process || '',
          title: hidden ? '' : fg.title || '',
          hidden,
          idle: (data.idleSec || 0) >= IDLE_AFTER_SECONDS,
          music: typeof data.music?.title === 'string' ? data.music.title.trim() : '',
        })

        const { wakeMinutes } = readSettings()
        if (wakeMinutes <= 0) return
        const idle = typeof data.idleSec === 'number' ? data.idleSec : 0
        if (idle < IDLE_AFTER_SECONDS) {
          lastWakeAt = 0
          return
        }
        const now = Date.now()
        if (lastWakeAt !== 0 && now - lastWakeAt < wakeMinutes * 60000) return
        const agents = ctx.agents.list()
        const target = agents.find((agent) => agent.status === 'idle')
        if (!target) return
        target.followup(wakeMessage(data))
        lastWakeAt = now
      } catch {}
    }, 30000)
    return () => clearInterval(timer)
  })

  ctx.tools.register({
    name: 'user_activity',
    description: '查看用户此刻在电脑上做什么：前台程序、窗口标题、空闲秒数、QQ音乐正在播放的歌。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: {
        type: 'object',
        properties: {
          foregroundProcess: { type: 'string' },
          foregroundTitle: { type: 'string' },
          foregroundHidden: { type: 'boolean' },
          idleSeconds: { type: 'number' },
          music: { type: 'string' },
          stale: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute: async () => {
      const data = readStatus()
      const fg = data?.foreground || {}
      const hidden = isPrivate(fg.process, fg.title)
      return {
        foregroundProcess: fg.process || '',
        foregroundTitle: hidden ? '' : fg.title || '',
        foregroundHidden: hidden,
        idleSeconds: typeof data?.idleSec === 'number' ? data.idleSec : -1,
        music: typeof data?.music?.title === 'string' ? data.music.title.trim() : '',
        stale: ageSeconds(data) > STALE_SECONDS,
      }
    },
  })
}

export { apply, inject, name }
