import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { PrintButton } from '@/components/PrintButton'

const BATTER_COUNT = 9
const PITCHER_ROWS = 3
const STAT_COLS = ['打', '安', '点', '盗', '四']

function pct(n: number) { return `${n.toFixed(2)}%` }

export default async function ScoreBookSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ scheduleId?: string; innings?: string }>
}) {
  const sp = await searchParams
  const innings = Math.min(9, Math.max(5, parseInt(sp.innings ?? '7') || 7))

  const schedule = sp.scheduleId
    ? await prisma.schedule.findUnique({ where: { id: sp.scheduleId } })
    : null

  const dateStr = schedule
    ? new Date(schedule.date).toLocaleDateString('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
      })
    : '____年____月____日（　　）'

  const opponent  = schedule?.opponent  ?? ''
  const location  = schedule?.location  ?? ''
  const meetTime  = schedule?.meetTime  ?? ''
  const startTime = schedule?.startTime ?? ''

  const qrUrl = schedule
    ? `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/admin/game?scheduleId=${schedule.id}`
    : ''

  // Column widths (percentages, must sum to 100)
  const fixedPct  = 4.5 + 19 + 5.5            // 打順+名前+守備  = 29%
  const statPct   = STAT_COLS.length * 3        // 5×3%            = 15%
  const iColPct   = (100 - fixedPct - statPct) / innings // remaining / innings

  const T = {
    border:    '1pt solid #111',
    thinBord:  '0.5pt solid #666',
    bg:        '#f0f0f0',
    bgLight:   '#fafafa',
    font:      '"Noto Sans JP", sans-serif',
    sz:        '7.5pt',
    szSm:      '6pt',
    szXs:      '5.5pt',
  } as const

  const cellBase: React.CSSProperties = {
    border: T.border,
    padding: '0.5mm 0.8mm',
    fontFamily: T.font,
    fontSize: T.sz,
    verticalAlign: 'middle',
    lineHeight: 1.2,
  }

  const hCell: React.CSSProperties = {
    ...cellBase,
    background: T.bg,
    fontWeight: 'bold',
    textAlign: 'center',
  }

  return (
    <>
      {/* ─── Print Styles ─── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { size: A4 portrait; margin: 8mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          .no-print { display: none !important; }
          .sheet {
            box-shadow: none !important;
            width: 100% !important;
            min-height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
        @media screen {
          body { background: #d0d0d0 !important; }
          .sheet {
            width: 210mm;
            min-height: 290mm;
            margin: 16px auto;
            padding: 5mm;
            background: white;
            box-shadow: 0 6px 24px rgba(0,0,0,0.3);
            box-sizing: border-box;
          }
        }
        .inning-cell-inner {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 14mm;
        }
        .ab1, .ab2 { flex: 1; display: flex; align-items: center; justify-content: center; }
        .ab2 { border-top: 0.5pt dashed #999; }
        @media print { .ab2 { border-top-color: #bbb; } }
      `}} />

      {/* ─── Admin Controls (screen only) ─── */}
      <div className="no-print" style={{
        maxWidth: '210mm', margin: '0 auto', padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        background: '#1e293b', borderBottom: '1px solid #334155',
      }}>
        <Link href="/admin" style={{ color: '#94a3b8', fontSize: '13px', textDecoration: 'none' }}>← 管理</Link>
        <span style={{ color: '#e2e8f0', fontWeight: 'bold', fontSize: '14px' }}>スコア記入シート</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: '8px' }}>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>イニング数:</span>
          {[5, 7, 9].map(n => (
            <Link
              key={n}
              href={`/admin/scorebook-sheet?${sp.scheduleId ? `scheduleId=${sp.scheduleId}&` : ''}innings=${n}`}
              style={{
                padding: '2px 8px', borderRadius: '6px', fontSize: '12px',
                border: innings === n ? '1px solid #3b82f6' : '1px solid #334155',
                background: innings === n ? '#2563eb' : 'transparent',
                color: innings === n ? 'white' : '#94a3b8',
                textDecoration: 'none',
              }}
            >{n}</Link>
          ))}
        </div>
        <PrintButton />
        {schedule && (
          <span style={{ color: '#64748b', fontSize: '12px', marginLeft: 'auto' }}>
            {dateStr} vs {opponent}
          </span>
        )}
      </div>

      {/* ─── Sheet ─── */}
      <div className="sheet">

        {/* ── ① ヘッダー行（登録マーク + タイトル） ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '2mm', gap: '2mm' }}>
          {/* TL 登録マーク */}
          <div style={{ width: '7mm', height: '7mm', background: 'black', flexShrink: 0, marginTop: '0.5mm' }} />

          {/* タイトル + 情報 */}
          <div style={{ flex: 1 }}>
            <div style={{ textAlign: 'center', fontFamily: T.font, fontWeight: 'bold', fontSize: '11pt', letterSpacing: '0.1em', marginBottom: '1.5mm' }}>
              BLITZ ソフトボール　スコア記入シート
            </div>

            {/* 試合情報 */}
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: T.sz, fontFamily: T.font }}>
              <tbody>
                <tr>
                  <td style={{ ...cellBase, width: '7%', background: T.bg, fontWeight: 'bold', textAlign: 'center', fontSize: T.szSm }}>日付</td>
                  <td style={{ ...cellBase, width: '33%', minWidth: '50mm' }}>{dateStr || '　'}</td>
                  <td style={{ ...cellBase, width: '5%', background: T.bg, fontWeight: 'bold', textAlign: 'center', fontSize: T.szSm }}>vs</td>
                  <td style={{ ...cellBase, width: '28%' }}>{opponent || '　'}</td>
                  <td style={{ ...cellBase, width: '5%', background: T.bg, fontWeight: 'bold', textAlign: 'center', fontSize: T.szSm }}>結果</td>
                  <td style={{ ...cellBase, width: '22%' }}>
                    <span style={{ marginRight: '4mm' }}>□勝</span>
                    <span style={{ marginRight: '4mm' }}>□負</span>
                    <span>□引分</span>
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellBase, background: T.bg, fontWeight: 'bold', textAlign: 'center', fontSize: T.szSm }}>球場</td>
                  <td style={{ ...cellBase }}>{location || '　'}</td>
                  <td style={{ ...cellBase, background: T.bg, fontWeight: 'bold', textAlign: 'center', fontSize: T.szSm }}>集合</td>
                  <td style={{ ...cellBase }}>{meetTime || '　　:　　'}</td>
                  <td style={{ ...cellBase, background: T.bg, fontWeight: 'bold', textAlign: 'center', fontSize: T.szSm }}>開始</td>
                  <td style={{ ...cellBase }}>{startTime || '　　:　　'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* TR 登録マーク + QRコード */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1mm', flexShrink: 0 }}>
            <div style={{ width: '7mm', height: '7mm', background: 'black' }} />
            {qrUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=56x56&data=${encodeURIComponent(qrUrl)}`}
                alt="QR"
                width="56" height="56"
                style={{ display: 'block' }}
              />
            )}
          </div>
        </div>

        {/* ── ② イニングスコア ── */}
        <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: T.font, fontSize: T.sz, marginBottom: '2mm' }}>
          <colgroup>
            <col style={{ width: '13%' }} />
            {Array.from({ length: innings }, () => <col key={Math.random()} style={{ width: pct((100 - 13 - 7) / innings) }} />)}
            <col style={{ width: '7%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...hCell, fontSize: T.szSm }}>チーム</th>
              {Array.from({ length: innings }, (_, i) => (
                <th key={i} style={{ ...hCell, fontSize: T.szSm }}>{i + 1}</th>
              ))}
              <th style={{ ...hCell, fontSize: T.szSm }}>計</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...cellBase, fontWeight: 'bold', background: T.bgLight, height: '7mm' }}>BLITZ</td>
              {Array.from({ length: innings }, (_, i) => <td key={i} style={{ ...cellBase, height: '7mm' }} />)}
              <td style={{ ...cellBase, background: T.bgLight, fontWeight: 'bold', height: '7mm' }} />
            </tr>
            <tr>
              <td style={{ ...cellBase, background: T.bgLight, height: '7mm', fontSize: T.szSm }}>
                {opponent || '相手'}
              </td>
              {Array.from({ length: innings }, (_, i) => <td key={i} style={{ ...cellBase, height: '7mm' }} />)}
              <td style={{ ...cellBase, background: T.bgLight, height: '7mm' }} />
            </tr>
          </tbody>
        </table>

        {/* ── ③ 打者成績 ── */}
        <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: T.font, fontSize: T.sz, marginBottom: '2mm' }}>
          <colgroup>
            <col style={{ width: pct(4.5) }} />
            <col style={{ width: pct(19) }} />
            <col style={{ width: pct(5.5) }} />
            {Array.from({ length: innings }, () => <col key={Math.random()} style={{ width: pct(iColPct) }} />)}
            {STAT_COLS.map(c => <col key={c} style={{ width: pct(3) }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...hCell, fontSize: T.szSm }}>#</th>
              <th style={{ ...hCell, fontSize: T.szSm }}>選手名</th>
              <th style={{ ...hCell, fontSize: T.szSm }}>守</th>
              {Array.from({ length: innings }, (_, i) => (
                <th key={i} style={{ ...hCell, fontSize: T.szSm }}>{i + 1}</th>
              ))}
              {STAT_COLS.map(c => (
                <th key={c} style={{ ...hCell, fontSize: T.szSm }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: BATTER_COUNT }, (_, bi) => (
              <tr key={bi}>
                {/* 打順 */}
                <td style={{ ...cellBase, textAlign: 'center', fontWeight: 'bold', background: T.bgLight, fontSize: T.sz }}>
                  {bi + 1}
                </td>
                {/* 選手名 */}
                <td style={{ ...cellBase, height: '16mm' }} />
                {/* 守備 */}
                <td style={{ ...cellBase, textAlign: 'center' }} />
                {/* イニングセル（上段=1打席目 / 下段=2打席目） */}
                {Array.from({ length: innings }, (_, ii) => (
                  <td key={ii} style={{ ...cellBase, padding: 0 }}>
                    <div className="inning-cell-inner">
                      <div className="ab1" />
                      <div className="ab2" />
                    </div>
                  </td>
                ))}
                {/* 集計欄 */}
                {STAT_COLS.map(c => (
                  <td key={c} style={{ ...cellBase, textAlign: 'center', background: T.bgLight }} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── ④ 投手成績 ── */}
        <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: T.font, fontSize: T.sz, marginBottom: '2mm' }}>
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...hCell, textAlign: 'left', paddingLeft: '1mm', fontSize: T.szSm }}>投手名</th>
              <th style={{ ...hCell, fontSize: T.szSm }}>投球回</th>
              <th style={{ ...hCell, fontSize: T.szSm }}>失点</th>
              <th style={{ ...hCell, fontSize: T.szSm }}>自責</th>
              <th style={{ ...hCell, fontSize: T.szSm }}>被安打</th>
              <th style={{ ...hCell, fontSize: T.szSm }}>K</th>
              <th style={{ ...hCell, fontSize: T.szSm }}>BB</th>
              <th style={{ ...hCell, fontSize: T.szSm }}>球数</th>
              <th style={{ ...hCell, fontSize: T.szSm }}>勝敗S</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: PITCHER_ROWS }, (_, i) => (
              <tr key={i}>
                <td style={{ ...cellBase, height: '9mm' }} />
                <td style={{ ...cellBase, textAlign: 'center' }} />
                <td style={{ ...cellBase, textAlign: 'center' }} />
                <td style={{ ...cellBase, textAlign: 'center' }} />
                <td style={{ ...cellBase, textAlign: 'center' }} />
                <td style={{ ...cellBase, textAlign: 'center' }} />
                <td style={{ ...cellBase, textAlign: 'center' }} />
                <td style={{ ...cellBase, textAlign: 'center' }} />
                <td style={{ ...cellBase, textAlign: 'center' }} />
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── ⑤ コード凡例 ── */}
        <div style={{
          border: T.border,
          padding: '1.5mm 2mm',
          fontFamily: T.font,
          fontSize: T.szSm,
          background: T.bgLight,
          marginBottom: '2mm',
          lineHeight: 1.7,
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '0.5mm', fontSize: T.sz }}>コード凡例　（太字=打数カウントあり　青字=出塁）</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 4mm' }}>
            <div>
              <span style={{ fontWeight: 'bold' }}>O</span>=アウト（三振・ゴロ・フライすべて）
              <span style={{ fontWeight: 'bold' }}>1</span>=単打
              <span style={{ fontWeight: 'bold' }}>2</span>=二塁打
              <span style={{ fontWeight: 'bold' }}>3</span>=三塁打
              <span style={{ fontWeight: 'bold' }}>4</span>=本塁打
            </div>
            <div>
              <span style={{ fontWeight: 'bold' }}>B</span>=四球
              <span style={{ fontWeight: 'bold' }}>D</span>=死球
              <span style={{ fontWeight: 'bold' }}>S</span>=犠打
              <span style={{ fontWeight: 'bold' }}>X</span>=犠飛
            </div>
            <div>
              数字サフィックス=打点　例: <span style={{ fontWeight: 'bold' }}>12</span>=単打2打点　<span style={{ fontWeight: 'bold' }}>41</span>=本塁打1打点
            </div>
            <div>
              <span style={{ fontWeight: 'bold' }}>s</span>サフィックス=盗塁　例: <span style={{ fontWeight: 'bold' }}>1s</span>=単打盗塁　<span style={{ fontWeight: 'bold' }}>12s</span>=単打2打点盗塁
            </div>
          </div>
          <div style={{ marginTop: '0.5mm', color: '#555', fontSize: T.szXs }}>
            ▸ イニングセル【上段=1打席目 / 下段=2打席目】　▸ 入力時のコード大文字小文字どちらでも可
          </div>
        </div>

        {/* ── BL/BR 登録マーク ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: '7mm', height: '7mm', background: 'black' }} />
          <div style={{ flex: 1, textAlign: 'center', fontFamily: T.font, fontSize: T.szXs, color: '#999', paddingTop: '2mm' }}>
            {innings}回　BLITZ HP — スコア記入シート v1
          </div>
          <div style={{ width: '7mm', height: '7mm', background: 'black' }} />
        </div>
      </div>
    </>
  )
}
