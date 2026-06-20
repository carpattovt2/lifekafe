'use client'

import { useState, useMemo, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  ASSETS, ACCOUNTS, BIASES, SCENARIOS, CATEGORIES,
  SP500_CAGR, GOLD_CAGR, BTC_CAGR,
  type Asset, type Account, type Bias,
} from '@/lib/finance-data'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<number, string> = {
  1: '#22c55e', 2: '#84cc16', 3: '#eab308', 4: '#f97316', 5: '#ef4444',
}
const RISK_LABELS: Record<number, string> = {
  1: 'Мінімальний', 2: 'Низький', 3: 'Середній', 4: 'Високий', 5: 'Екстремальний',
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function calcFV(principal: number, monthly: number, annualRate: number, years: number) {
  let balance = principal
  const mr = annualRate / 100 / 12
  for (let i = 0; i < years * 12; i++) balance = balance * (1 + mr) + monthly
  return Math.round(balance)
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: number }) {
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px',
      background: RISK_COLORS[level] + '22', color: RISK_COLORS[level],
      border: `1px solid ${RISK_COLORS[level]}44`, letterSpacing: '0.04em', flexShrink: 0,
    }}>
      {RISK_LABELS[level]}
    </span>
  )
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: '10px', fontWeight: 700, color: 'var(--accent)',
      letterSpacing: '0.07em', textTransform: 'uppercase',
      marginTop: '16px', marginBottom: '7px',
    }}>
      {text}
    </div>
  )
}

function Slider({
  label, value, min, max, step, onChange, format,
}: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; format: (v: number) => string
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 700 }}>{format(value)}</span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer', height: '4px' }}
      />
    </div>
  )
}

// ─── Asset Card ──────────────────────────────────────────────────────────────

function AssetCard({ asset, open, onToggle }: { asset: Asset; open: boolean; onToggle: () => void }) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: '10px',
      overflow: 'hidden', background: 'var(--bg2)',
      borderLeft: `3px solid ${RISK_COLORS[asset.riskLevel]}`,
    }}>
      <button
        onClick={onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: '22px', flexShrink: 0 }}>{asset.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{asset.name}</span>
            <RiskBadge level={asset.riskLevel} />
            {asset.paysDividends && (
              <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44' }}>
                💸 {asset.dividendYield}
              </span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{asset.tagline}</div>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '13px', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 16px', borderTop: '1px solid var(--border)' }}>
          <SectionLabel text="Історія" />
          <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.65, margin: 0 }}>{asset.history}</p>

          <SectionLabel text="Як це працює" />
          <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.65, margin: 0 }}>{asset.howItWorks}</p>

          <SectionLabel text="Ризики" />
          <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {asset.risks.map((r, i) => (
              <li key={i} style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.5 }}>{r}</li>
            ))}
          </ul>

          <SectionLabel text="Статистика" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '7px' }}>
            {asset.stats.map((s, i) => (
              <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '7px', padding: '9px 11px' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '3px' }}>{s.label}</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)' }}>{s.value}</div>
              </div>
            ))}
          </div>

          <SectionLabel text="Як інвестувати" />
          <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.65, margin: 0 }}>{asset.howToInvest}</p>

          {asset.tickers && (
            <div style={{ display: 'flex', gap: '5px', marginTop: '9px', flexWrap: 'wrap' }}>
              {asset.tickers.map(t => (
                <span key={t} style={{
                  fontSize: '11px', fontWeight: 700, padding: '3px 9px',
                  background: 'var(--accent)22', color: 'var(--accent)',
                  border: '1px solid var(--accent)44', borderRadius: '5px',
                }}>{t}</span>
              ))}
            </div>
          )}

          <div style={{ marginTop: '13px', padding: '11px 13px', background: 'var(--accent)0f', border: '1px solid var(--accent)33', borderRadius: '8px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em' }}>💡 ПОРАДА  </span>
            <span style={{ fontSize: '12px', color: 'var(--text)' }}>{asset.tip}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Account Card ────────────────────────────────────────────────────────────

function AccountCard({ account, open, onToggle }: { account: Account; open: boolean; onToggle: () => void }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--bg2)', borderLeft: `3px solid ${account.tagColor}` }}>
      <button
        onClick={onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: '22px', flexShrink: 0 }}>{account.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{account.name}</span>
            <span style={{
              fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px',
              background: account.tagColor + '22', color: account.tagColor,
              border: `1px solid ${account.tagColor}44`,
            }}>{account.tag}</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
            {account.fullName} · ліміт: {account.limit}
          </div>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '13px', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 16px', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.65, margin: '13px 0 0' }}>{account.description}</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '13px' }}>
            <div style={{ background: '#22c55e11', border: '1px solid #22c55e33', borderRadius: '8px', padding: '11px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#22c55e', marginBottom: '7px', letterSpacing: '0.05em' }}>✓ ПЕРЕВАГИ</div>
              {account.pros.map((p, i) => <div key={i} style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '5px', lineHeight: 1.5 }}>• {p}</div>)}
            </div>
            <div style={{ background: '#ef444411', border: '1px solid #ef444433', borderRadius: '8px', padding: '11px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444', marginBottom: '7px', letterSpacing: '0.05em' }}>✗ НЕДОЛІКИ</div>
              {account.cons.map((c, i) => <div key={i} style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '5px', lineHeight: 1.5 }}>• {c}</div>)}
            </div>
          </div>

          <div style={{ marginTop: '11px', padding: '11px 13px', background: 'var(--accent)0f', border: '1px solid var(--accent)33', borderRadius: '8px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em' }}>🎯 ПІДХОДИТЬ  </span>
            <span style={{ fontSize: '12px', color: 'var(--text)' }}>{account.bestFor}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Bias Card ───────────────────────────────────────────────────────────────

function BiasCard({ bias, open, onToggle }: { bias: Bias; open: boolean; onToggle: () => void }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--bg2)' }}>
      <button
        onClick={onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: '26px', flexShrink: 0 }}>{bias.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{bias.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{bias.ua}</div>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '13px' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 14px 16px', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.65, margin: '13px 0 0' }}>{bias.description}</p>
          <SectionLabel text="Реальний приклад" />
          <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.65, margin: 0, fontStyle: 'italic' }}>{bias.example}</p>
          <SectionLabel text="Як виправити" />
          <div style={{ padding: '11px 13px', background: '#22c55e11', border: '1px solid #22c55e33', borderRadius: '8px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.65, margin: 0 }}>{bias.fix}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab Content ─────────────────────────────────────────────────────────────

type Tab = 'assets' | 'accounts' | 'calculator' | 'psychology'

function AssetsTab({ openId, setOpenId }: { openId: string | null; setOpenId: (id: string | null) => void }) {
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('all')

  const filtered = useMemo(() => {
    return ASSETS.filter(a => {
      const matchCat = cat === 'all' || a.category === cat
      const q = search.toLowerCase()
      const matchSearch = !q || a.name.toLowerCase().includes(q) || a.fullName.toLowerCase().includes(q) || a.tagline.toLowerCase().includes(q)
      return matchCat && matchSearch
    })
  }, [search, cat])

  return (
    <div>
      {/* Search */}
      <input
        type="text"
        placeholder="Пошук активу..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '10px 12px', background: 'var(--bg2)',
          border: '1px solid var(--border)', borderRadius: '8px',
          color: 'var(--text)', fontSize: '13px', marginBottom: '10px',
          boxSizing: 'border-box',
        }}
      />
      {/* Category filter */}
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            style={{
              padding: '5px 12px', fontSize: '12px', fontWeight: 600,
              border: '1px solid var(--border)', borderRadius: '20px',
              background: cat === c.id ? 'var(--accent)' : 'var(--bg2)',
              color: cat === c.id ? '#fff' : 'var(--muted)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '13px', padding: '32px 0' }}>Нічого не знайдено</div>
        )}
        {filtered.map(asset => (
          <AssetCard
            key={asset.id}
            asset={asset}
            open={openId === asset.id}
            onToggle={() => setOpenId(openId === asset.id ? null : asset.id)}
          />
        ))}
      </div>
    </div>
  )
}

function AccountsTab({ openId, setOpenId }: { openId: string | null; setOpenId: (id: string | null) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      {ACCOUNTS.map(acc => (
        <AccountCard
          key={acc.id}
          account={acc}
          open={openId === acc.id}
          onToggle={() => setOpenId(openId === acc.id ? null : acc.id)}
        />
      ))}
    </div>
  )
}

function CalculatorTab() {
  const [principal, setPrincipal] = useState(20000)
  const [monthly, setMonthly] = useState(500)
  const [rate, setRate] = useState(9)
  const [years, setYears] = useState(10)
  const [inflation, setInflation] = useState(false)
  const [showTable, setShowTable] = useState(false)

  // What-if interactive
  const [wiAsset, setWiAsset] = useState<'sp500' | 'gold' | 'btc'>('sp500')
  const [wiYear, setWiYear] = useState(2010)
  const [wiAmount, setWiAmount] = useState(10000)

  const inflationRate = 3
  const displayRate = inflation ? ((1 + rate / 100) / (1 + inflationRate / 100) - 1) * 100 : rate

  const chartData = useMemo(() => {
    const data = []
    let balance = principal
    const mr = displayRate / 100 / 12
    for (let y = 1; y <= years; y++) {
      for (let m = 0; m < 12; m++) balance = balance * (1 + mr) + monthly
      const contributed = principal + monthly * 12 * y
      data.push({
        year: `${y}р`,
        'Загальна сума': Math.round(balance),
        'Вкладено': Math.round(contributed),
      })
    }
    return data
  }, [principal, monthly, displayRate, years])

  const finalValue = chartData[chartData.length - 1]?.['Загальна сума'] ?? 0
  const totalContributed = principal + monthly * 12 * years
  const totalEarnings = finalValue - totalContributed

  // Cost of waiting
  const waitingCosts = useMemo(() => {
    return [1, 2, 5].map(waitYears => {
      const effectiveYears = Math.max(years - waitYears, 1)
      const lateValue = calcFV(principal, monthly, rate, effectiveYears)
      return { wait: waitYears, value: lateValue, loss: finalValue - lateValue }
    })
  }, [principal, monthly, rate, years, finalValue])

  // Interactive what-if
  const wiResult = useMemo(() => {
    const cagrMap = wiAsset === 'sp500' ? SP500_CAGR : wiAsset === 'gold' ? GOLD_CAGR : BTC_CAGR
    const minYear = wiAsset === 'btc' ? 2016 : 2000
    const clampedYear = Math.max(wiYear, minYear)
    const cagr = cagrMap[clampedYear] ?? 0.09
    const horizonYears = 2026 - clampedYear
    const result = Math.round(wiAmount * Math.pow(1 + cagr, horizonYears))
    const multiplier = (result / wiAmount).toFixed(1)
    return { result, multiplier, horizonYears, cagr: (cagr * 100).toFixed(1) }
  }, [wiAsset, wiYear, wiAmount])

  const wiMinYear = wiAsset === 'btc' ? 2016 : 2000

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Compound Interest ── */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>📈 Складний відсоток</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={inflation} onChange={e => setInflation(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            Реальна дохідність (-3% інфляція)
          </label>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '18px' }}>
          <Slider label="Початкова сума" value={principal} min={0} max={100000} step={1000} onChange={setPrincipal} format={v => fmt(v)} />
          <Slider label="Щомісячний внесок" value={monthly} min={0} max={5000} step={100} onChange={setMonthly} format={v => fmt(v)} />
          <Slider label="Річна дохідність" value={rate} min={1} max={20} step={0.5} onChange={setRate} format={v => `${v}%`} />
          <Slider label="Горизонт" value={years} min={1} max={40} step={1} onChange={setYears} format={v => `${v} р.`} />
        </div>

        {/* Result cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '18px' }}>
          {[
            { label: inflation ? 'Сума (у сьогоднішніх $)' : 'Підсумкова сума', value: fmt(finalValue), color: 'var(--accent)' },
            { label: 'Всього вкладено', value: fmt(totalContributed), color: 'var(--text)' },
            { label: 'Заробіток', value: fmt(totalEarnings), color: '#22c55e' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '5px' }}>{label}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6b7280" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#6b7280" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
            <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: 'var(--muted)' }} width={45} />
            <Tooltip
              formatter={(v: unknown) => [fmt(v as number)]}
              contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
            />
            <Area type="monotone" dataKey="Загальна сума" stroke="var(--accent)" fill="url(#g1)" strokeWidth={2} />
            <Area type="monotone" dataKey="Вкладено" stroke="#6b7280" fill="url(#g2)" strokeWidth={1.5} strokeDasharray="4 2" />
          </AreaChart>
        </ResponsiveContainer>

        {/* Year-by-year table toggle */}
        <button
          onClick={() => setShowTable(!showTable)}
          style={{ marginTop: '12px', width: '100%', padding: '8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--muted)', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
        >
          {showTable ? '▲ Сховати' : '▼ Рік за роком'}
        </button>
        {showTable && (
          <div style={{ marginTop: '10px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Рік', 'Вкладено', 'Заробіток', 'Підсумок'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', fontSize: '10px', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chartData.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 10px', color: 'var(--muted)', textAlign: 'right' }}>{row.year}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--text)', textAlign: 'right' }}>{fmt(row['Вкладено'])}</td>
                    <td style={{ padding: '6px 10px', color: '#22c55e', textAlign: 'right' }}>{fmt(row['Загальна сума'] - row['Вкладено'])}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--accent)', fontWeight: 700, textAlign: 'right' }}>{fmt(row['Загальна сума'])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Cost of Waiting ── */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>⏳ Ціна зволікання</h2>
        <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 14px' }}>
          Скільки ви втрачаєте якщо "зачекаєте кращого моменту"? (при поточних налаштуваннях, {rate}%/рік)
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 13px', background: '#22c55e11', border: '1px solid #22c55e33', borderRadius: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Інвестую ЗАРАЗ</span>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#22c55e' }}>{fmt(finalValue)}</span>
          </div>
          {waitingCosts.map(({ wait, value, loss }) => (
            <div key={wait} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 13px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text)' }}>Зачекаю {wait} {wait === 1 ? 'рік' : 'роки'}</div>
                <div style={{ fontSize: '11px', color: '#ef4444' }}>втрачаю {fmt(loss)}</div>
              </div>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--muted)' }}>{fmt(value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Interactive What-If ── */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', margin: '0 0 14px' }}>🔮 Що якби я вклав...</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
          {/* Asset selector */}
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.04em', marginBottom: '7px' }}>АКТИВ</div>
            <div style={{ display: 'flex', gap: '5px' }}>
              {[
                { id: 'sp500', label: '📈 S&P 500' },
                { id: 'gold', label: '🥇 Gold' },
                { id: 'btc', label: '₿ Bitcoin' },
              ].map(a => (
                <button
                  key={a.id}
                  onClick={() => { setWiAsset(a.id as typeof wiAsset); setWiYear(Math.max(wiYear, a.id === 'btc' ? 2016 : 2000)) }}
                  style={{
                    flex: 1, padding: '8px 4px', fontSize: '12px', fontWeight: 600,
                    border: '1px solid var(--border)', borderRadius: '7px',
                    background: wiAsset === a.id ? 'var(--accent)' : 'var(--bg)',
                    color: wiAsset === a.id ? '#fff' : 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <Slider
            label="Сума інвестиції"
            value={wiAmount}
            min={1000}
            max={100000}
            step={1000}
            onChange={setWiAmount}
            format={v => fmt(v)}
          />
          <Slider
            label={`Рік інвестиції (${wiMinYear}–2022)`}
            value={Math.max(wiYear, wiMinYear)}
            min={wiMinYear}
            max={2022}
            step={1}
            onChange={setWiYear}
            format={v => `${v}`}
          />
        </div>

        {/* Result */}
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>
            {fmt(wiAmount)} у {Math.max(wiYear, wiMinYear)} → сьогодні (~{wiResult.cagr}%/рік, {wiResult.horizonYears} р.)
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent)', marginBottom: '4px' }}>
            {fmt(wiResult.result)}
          </div>
          <div style={{ fontSize: '14px', color: '#22c55e', fontWeight: 600 }}>×{wiResult.multiplier} від вкладеної суми</div>
        </div>
      </div>

      {/* ── Static Scenarios ── */}
      <div>
        <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>📋 Реальні сценарії ($10k)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
          {SCENARIOS.map((s, i) => (
            <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px' }}>{s.icon}</span>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{s.title}</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{s.year} · {s.asset}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Вклали</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{fmt(s.amount)}</div>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '16px' }}>→</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Зараз</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)' }}>{fmt(s.result)}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Ріст</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#22c55e' }}>×{(s.result / s.amount).toFixed(1)}</div>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>{s.note}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PsychologyTab({ openId, setOpenId }: { openId: string | null; setOpenId: (id: string | null) => void }) {
  return (
    <div>
      <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
        Найбільший ворог інвестора — не ринок, а власна психологія. Ось 12 упереджень що коштують людям мільйони.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {BIASES.map(bias => (
          <BiasCard
            key={bias.id}
            bias={bias}
            open={openId === bias.id}
            onToggle={() => setOpenId(openId === bias.id ? null : bias.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; icon: string; label: string; short: string }[] = [
  { id: 'assets',     icon: '📊', label: 'Активи',     short: 'Активи' },
  { id: 'accounts',   icon: '🏦', label: 'Рахунки',    short: 'Рахунки' },
  { id: 'calculator', icon: '🧮', label: 'Калькулятор', short: 'Калькул.' },
  { id: 'psychology', icon: '🧠', label: 'Психологія',  short: 'Психол.' },
]

export default function FinanceClient() {
  const [tab, setTab] = useState<Tab>('assets')
  const [openId, setOpenId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const handleTabChange = (t: Tab) => {
    setTab(t)
    setOpenId(null)
  }

  const content = (
    <>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>
          💰 ФІНАНСОВА БАЗА ЗНАНЬ
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '5px 0 0' }}>
          {ASSETS.length} активів · {ACCOUNTS.length} типів рахунків · {BIASES.length} психологічних упереджень
        </p>
      </div>

      {tab === 'assets'     && <AssetsTab     openId={openId} setOpenId={setOpenId} />}
      {tab === 'accounts'   && <AccountsTab   openId={openId} setOpenId={setOpenId} />}
      {tab === 'calculator' && <CalculatorTab />}
      {tab === 'psychology' && <PsychologyTab openId={openId} setOpenId={setOpenId} />}
    </>
  )

  // ── Mobile layout: fixed bottom tab bar ──────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ paddingBottom: 72 }}>
        {content}

        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
          background: 'var(--bg2)', borderTop: '1px solid var(--border)',
          display: 'flex', height: 60,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: '2px', background: 'none', border: 'none',
                cursor: 'pointer', color: tab === t.id ? 'var(--accent)' : 'var(--muted)',
                fontSize: '9px', fontWeight: 600, letterSpacing: '0.03em',
                borderTop: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '20px' }}>{t.icon}</span>
              {t.short}
            </button>
          ))}
        </nav>
      </div>
    )
  }

  // ── Desktop layout: left sidebar ─────────────────────────────────────────
  return (
    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
      {/* Sidebar */}
      <nav style={{
        width: 160, flexShrink: 0,
        position: 'sticky', top: '24px',
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '12px 8px',
        display: 'flex', flexDirection: 'column', gap: '2px',
      }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.07em', textTransform: 'uppercase', padding: '4px 10px 8px' }}>
          НАВІГАЦІЯ
        </div>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '9px 10px', borderRadius: '8px',
              background: tab === t.id ? 'var(--accent)22' : 'none',
              border: tab === t.id ? '1px solid var(--accent)44' : '1px solid transparent',
              color: tab === t.id ? 'var(--accent)' : 'var(--muted)',
              fontSize: '13px', fontWeight: tab === t.id ? 700 : 500,
              cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: '16px' }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {content}
      </div>
    </div>
  )
}
