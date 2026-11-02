// 侧栏状态条 + 设置页。状态条只显示当前状态，设置和历史记录放进 设置 → 用户状态。
window.__ModuleLoader__.load({
  id: 'dsh-user-status',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useState } = React

    const DOT = {
      active: '#4ade80',
      idle: '#fbbf24',
      away: '#9ca3af',
    }

    const MUTED = 'var(--dsw-alias-text-secondary, #9aa0a6)'
    const BORDER = 'var(--dsw-alias-border, rgba(255,255,255,0.14))'

    function levelOf(data) {
      if (!data || data.stale || typeof data.idleSeconds !== 'number') return 'away'
      return data.idleSeconds < 300 ? 'active' : 'idle'
    }

    function labelOf(data) {
      if (!data || data.stale) return '读不到状态'
      if (data.music) return data.music
      if (data.foreground?.hidden) return data.foreground.appName || '隐私程序'
      if (data.foreground?.isDsh) return '在和你聊天'
      if (data.foreground?.title) return data.foreground.title
      if (data.foreground?.process) return data.foreground.process
      return '空闲'
    }

    function row(label, value) {
      return h(
        'div',
        { style: { display: 'flex', gap: 6 } },
        h('span', { style: { color: MUTED, flex: '0 0 auto' } }, label),
        h('span', { style: { wordBreak: 'break-all' } }, value),
      )
    }

    function StatusChip(props) {
      const [data, setData] = useState(null)
      const [open, setOpen] = useState(false)
      const wide = Boolean(props && props.wide)

      useEffect(() => {
        let alive = true
        const tick = () => {
          fetch('user-status.json', { cache: 'no-store' })
            .then((response) => response.json())
            .then((value) => { if (alive) setData(value) })
            .catch(() => {})
        }
        tick()
        const timer = setInterval(tick, 2000)
        return () => { alive = false; clearInterval(timer) }
      }, [])

      const level = levelOf(data)
      const text = labelOf(data)

      return h(
        'div',
        { style: { position: 'relative', display: 'flex', alignItems: 'center' } },
        h(
          'button',
          {
            type: 'button',
            onClick: () => setOpen((value) => !value),
            title: text,
            'aria-label': `当前状态：${text}`,
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
              maxWidth: wide ? 190 : 34,
              padding: '5px 8px',
              border: 'none',
              borderRadius: 7,
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              font: 'inherit',
            },
          },
          h('span', {
            style: {
              width: 8,
              height: 8,
              borderRadius: 4,
              flex: '0 0 auto',
              background: DOT[level],
              boxShadow: level === 'active' ? '0 0 6px ' + DOT.active : 'none',
            },
          }),
          wide
            ? h('span', {
                style: {
                  fontSize: 12,
                  lineHeight: '18px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                },
              }, text)
            : null,
        ),
        open
          ? h(
              'div',
              {
                style: {
                  position: 'fixed',
                  left: 12,
                  bottom: 58,
                  zIndex: 60,
                  width: 260,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid ' + BORDER,
                  background: 'var(--dsw-alias-bg-elevated, #20242c)',
                  color: 'var(--dsw-alias-text-primary, #e8eaed)',
                  boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
                  fontSize: 12,
                  lineHeight: '1.65',
                },
              },
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                  },
                },
                h('span', { style: { fontWeight: 600 } }, '当前状态'),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => setOpen(false),
                    'aria-label': '收起',
                    title: '收起',
                    style: {
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      cursor: 'pointer',
                      fontSize: 15,
                      lineHeight: '15px',
                      padding: '2px 4px',
                      opacity: 0.65,
                    },
                  },
                  '×',
                ),
              ),
              row('前台', data?.foreground?.isDsh
                ? '和你聊天'
                : data?.foreground?.hidden
                  ? (data.foreground.appName || '隐私程序') + '（已打码）'
                  : data?.foreground?.title || data?.foreground?.process || '未知'),
              row('空闲', typeof data?.idleSeconds === 'number'
                ? (data.idleSeconds < 60
                  ? Math.round(data.idleSeconds) + ' 秒'
                  : Math.round(data.idleSeconds / 60) + ' 分钟')
                : '未知'),
              row('音乐', data?.music || '没在放'),
              data?.stale ? h('div', { style: { marginTop: 6, color: '#fbbf24' } }, '采集器停了') : null,
            )
          : null,
      )
    }

    function SettingRow(props) {
      return h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 10,
            fontSize: 13,
          },
        },
        h('span', { style: { flex: '0 0 auto' } }, props.label),
        h('input', {
          type: 'number',
          min: props.min,
          max: props.max,
          value: props.value,
          onChange: (event) => props.onChange(event.target.value),
          style: {
            width: 72,
            padding: '4px 8px',
            borderRadius: 6,
            border: '1px solid ' + BORDER,
            background: 'transparent',
            color: 'inherit',
            fontSize: 13,
          },
        }),
        h('span', { style: { color: MUTED, flex: '0 0 auto' } }, props.unit),
        props.hint ? h('span', { style: { color: MUTED, fontSize: 11 } }, props.hint) : null,
      )
    }

    function SettingsPage() {
      const [settings, setSettings] = useState(null)
      const [historyDraft, setHistoryDraft] = useState('')
      const [historyModeDraft, setHistoryModeDraft] = useState('off')
      const [history, setHistory] = useState(null)
      const [saved, setSaved] = useState(false)

      useEffect(() => {
        fetch('user-status-settings.json', { cache: 'no-store' })
          .then((response) => response.json())
          .then((value) => {
            setSettings(value)
            if (typeof value?.historyDays === 'number') setHistoryDraft(String(value.historyDays))
            setHistoryModeDraft(value?.historyMode === 'full' ? 'full' : value?.historyMode === 'summary' ? 'summary' : 'off')
          })
          .catch(() => {})
      }, [])

      useEffect(() => {
        let alive = true
        const tick = () => {
          fetch('user-status-history.json', { cache: 'no-store' })
            .then((response) => response.json())
            .then((value) => { if (alive) setHistory(value) })
            .catch(() => {})
        }
        tick()
        const timer = setInterval(tick, 15000)
        return () => { alive = false; clearInterval(timer) }
      }, [])

      const save = () => {
        fetch('user-status-settings.json', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            historyDays: Number(historyDraft) || 3,
            historyMode: historyModeDraft,
          }),
        })
          .then((response) => response.json())
          .then((value) => {
            setSettings(value)
            setHistoryDraft(String(value?.historyDays ?? 3))
            setHistoryModeDraft(value?.historyMode === 'full' ? 'full' : value?.historyMode === 'summary' ? 'summary' : 'off')
            setSaved(true)
            setTimeout(() => setSaved(false), 1500)
          })
          .catch(() => {})
      }

      const clock = (date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      const apps = Array.isArray(history?.apps) ? history.apps : []
      const hours = Array.isArray(history?.hours) ? history.hours : []

      return h(
        'div',
        { style: { padding: '4px 0', fontSize: 13 } },
        h('div', { style: { fontWeight: 600, fontSize: 15, marginBottom: 4 } }, '用户状态'),
        h('div', { style: { color: MUTED, fontSize: 12, marginBottom: 16, lineHeight: 1.6 } },
          '侧栏底部的小圆点显示你现在在做什么。记录只保存在本机，不会进入对话上下文。'),
        h(SettingRow, {
          label: '记录天数',
          unit: '天',
          min: 1,
          max: 30,
          value: historyDraft,
          onChange: setHistoryDraft,
          hint: '保留最近多久的应用记录',
        }),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13 } },
          h('span', { style: { flex: '0 0 auto' } }, '历史记录'),
          h('select', {
            value: historyModeDraft,
            onChange: (event) => setHistoryModeDraft(event.target.value),
            style: {
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid ' + BORDER,
              background: 'transparent',
              color: 'inherit',
              fontSize: 13,
            },
          },
            h('option', { value: 'off' }, '不读'),
            h('option', { value: 'summary' }, '总时长'),
            h('option', { value: 'full' }, '按小时'),
          ),
          h('span', { style: { color: MUTED, fontSize: 11 } },
            historyModeDraft === 'off'
              ? '不花 token'
              : historyModeDraft === 'summary'
                ? '每轮约 30 token'
                : '每轮几千到上万 token'),
        ),
        h('button', {
          type: 'button',
          onClick: save,
          style: {
            padding: '5px 14px',
            borderRadius: 7,
            border: 'none',
            background: 'var(--dsw-alias-bg-layer-2, #3a4150)',
            color: 'inherit',
            fontSize: 13,
            cursor: 'pointer',
            marginBottom: 4,
          },
        }, saved ? '已保存' : '保存'),
        h('div', { style: { marginTop: 18 } },
          h('div', { style: { fontWeight: 600, marginBottom: 8 } }, `最近 ${history?.days ?? settings?.historyDays ?? 3} 天`),
          history?.mode === 'full'
            ? hours.length > 0
              ? hours.slice(0, 24).map((bucket, index) => h('div', { key: index, style: { marginBottom: 8 } },
                  h('div', { style: { fontSize: 12, color: MUTED, marginBottom: 2 } }, bucket.hour),
                  bucket.apps.map((entry, i) => h('div', {
                    key: i,
                    style: { display: 'flex', gap: 8, padding: '1px 0 1px 10px', fontSize: 12 },
                  },
                    h('span', { style: { flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.app),
                    h('span', { style: { flex: '0 0 auto', color: MUTED } }, `${entry.minutes} 分钟`),
                  )),
                ))
              : h('div', { style: { color: MUTED, fontSize: 12 } }, '还没有记录，运行一会儿就有了。')
            : apps.length > 0
              ? apps.map((item, index) => {
                  const from = new Date(item.firstTs)
                  const to = new Date(item.lastTs)
                  const duration = item.minutes >= 60
                    ? `${Math.floor(item.minutes / 60)} 小时${item.minutes % 60 ? ` ${item.minutes % 60} 分` : ''}`
                    : `${item.minutes} 分钟`
                  return h('div', {
                    key: index,
                    style: {
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8,
                      padding: '5px 0',
                      borderBottom: '1px solid ' + BORDER,
                    },
                  },
                    h('span', { style: { flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, item.app),
                    h('span', { style: { flex: '0 0 auto', color: MUTED, fontSize: 12 } }, `${duration} · ${clock(from)}-${clock(to)}`),
                  )
                })
              : h('div', { style: { color: MUTED, fontSize: 12 } }, '还没有记录，运行一会儿就有了。'),
        ),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-user-status-ui', 'hide-feedback-pill')
          style.textContent = '[data-dafeiyu-notice="feedback-button"]{display:none !important}'
          document.head.appendChild(style)
          return () => { style.remove() }
        })
        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register({
            name: 'sidebar.footer.action',
            id: 'user-status',
            order: 10,
          }, StatusChip),
        )
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register({
            name: 'settings.section',
            id: 'user-status',
            order: 40,
            label: '用户状态',
          }, SettingsPage),
        )
      },
    }
  },
})
