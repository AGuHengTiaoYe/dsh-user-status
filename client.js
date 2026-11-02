// 侧栏底部的小状态条：显示当前前台 / 空闲 / QQ音乐，点一下展开详情。
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
        h('span', { style: { color: 'var(--dsw-alias-text-secondary, #9aa0a6)', flex: '0 0 auto' } }, label),
        h('span', { style: { wordBreak: 'break-all' } }, value),
      )
    }

    function Status(props) {
      const [data, setData] = useState(null)
      const [open, setOpen] = useState(false)
      const [wakeDraft, setWakeDraft] = useState('')
      const [saved, setSaved] = useState(false)
      const wide = Boolean(props && props.wide)

      useEffect(() => {
        fetch('user-status-settings.json', { cache: 'no-store' })
          .then((response) => response.json())
          .then((value) => {
            if (typeof value?.wakeMinutes === 'number') setWakeDraft(String(value.wakeMinutes))
          })
          .catch(() => {})
      }, [])

      const saveWake = () => {
        const value = Number(wakeDraft) || 0
        fetch('user-status-settings.json', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ wakeMinutes: value }),
        })
          .then((response) => response.json())
          .then((next) => {
            setWakeDraft(String(next?.wakeMinutes ?? 0))
            setSaved(true)
            setTimeout(() => setSaved(false), 1500)
          })
          .catch(() => {})
      }

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
                  border: '1px solid var(--dsw-alias-border, rgba(255,255,255,0.14))',
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
              h('div', {
                style: {
                  marginTop: 10,
                  paddingTop: 8,
                  borderTop: '1px solid var(--dsw-alias-border, rgba(255,255,255,0.12))',
                },
              },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                  h('span', { style: { color: 'var(--dsw-alias-text-secondary, #9aa0a6)' } }, '叫醒间隔'),
                  h('input', {
                    type: 'number',
                    min: 0,
                    max: 1440,
                    value: wakeDraft,
                    onChange: (event) => setWakeDraft(event.target.value),
                    style: {
                      width: 54,
                      padding: '3px 6px',
                      borderRadius: 6,
                      border: '1px solid var(--dsw-alias-border, rgba(255,255,255,0.18))',
                      background: 'transparent',
                      color: 'inherit',
                      fontSize: 12,
                    },
                  }),
                  h('span', { style: { color: 'var(--dsw-alias-text-secondary, #9aa0a6)' } }, '分钟'),
                  h('button', {
                    type: 'button',
                    onClick: saveWake,
                    style: {
                      marginLeft: 'auto',
                      padding: '3px 10px',
                      borderRadius: 6,
                      border: 'none',
                      background: 'var(--dsw-alias-bg-layer-2, #3a4150)',
                      color: 'inherit',
                      fontSize: 12,
                      cursor: 'pointer',
                    },
                  }, saved ? '已保存' : '保存'),
                ),
                h('div', {
                  style: {
                    marginTop: 4,
                    fontSize: 11,
                    color: 'var(--dsw-alias-text-secondary, #9aa0a6)',
                  },
                }, '0 = 关闭；挂机满 5 分钟后，每隔这么久提醒一次'),
              ),
            )
          : null,
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
          }, Status),
        )
      },
    }
  },
})
