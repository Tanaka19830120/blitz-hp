import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { PrintButton } from '@/components/PrintButton'

const BATTER_COUNT = 9
const PITCHER_ROWS = 3
const STAT_COLS = ['打', '安', '点', '盗', '四']

function pct(n: number) { return `${n.toFixed(3)}%` }

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

  // Column widths: [打順 4.5%][名前 19%][守 5.5%][inn×N][打3%][安3%][点3%][盗3%][四3%] = 100%
  const fixedPct = 4.5 + 19 + 5.5          // 29%
  const statPct  = STAT_COLS.length * 3     // 15%
  const iColPct  = (100 - fixedPct - statPct) / innings

  const font = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif'
  const border = '0.8pt solid #000'
  const borderThin = '0.5pt solid #555'

  const cell: React.CSSProperties = {
    border,
    padding: '0.4mm 0.6mm',
    fontFamily: font,
    fontSize: '7pt',
    verticalAlign: 'middle',
    lineHeight: 1.15,
    color: '#000',
  }

  const hdr: React.CSSProperties = {
    ...cell,
    background: '#d8d8d8',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: '6.5pt',
  }

  const inningNums = Array.from({ length: innings }, (_, i) => i + 1)

  return (
    <>
      {/* ─── Styles ─── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { size: A4 portrait; margin: 7mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          .no-print { display: none !important; }
          .sheet { box-shadow: none !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }
        }
        @media screen {
          body { background: #b0b8c4 !important; }
          .sheet {
            width: 210mm; min-height: 290mm;
            margin: 0 auto; padding: 6mm;
            background: white;
            box-shadow: 0 4px 20px rgba(0,0,0,0.35);
            box-sizing: border-box;
          }
        }
        .inn-cell { display: flex; flex-direction: column; height: 100%; min-height: 14mm; }
        .ab1, .ab2 { flex: 1; }
        .ab2 { border-top: 0.5pt dashed #666; }
      `}} />

      {/* ─── Controls (screen only) ─── */}
      <div className="no-print" style={{
        width: '210mm', margin: '0 auto', padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
        background: '#1e293b', borderBottom: '1px solid #334155',
      }}>
        <Link href="/admin/game" style={{ color: '#94a3b8', fontSize: '13px', textDecoration: 'none' }}>← 試合入力</Link>
        <span style={{ color: '#e2e8f0', fontWeight: 'bold', fontSize: '14px' }}>スコア記入シート</span>
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>イニング数:</span>
          {[5, 7, 9].map(n => (
            <Link key={n}
              href={`/admin/scorebook-sheet?${sp.scheduleId ? `scheduleId=${sp.scheduleId}&` : ''}innings=${n}`}
              style={{
                padding: '2px 10px', borderRadius: '6px', fontSize: '12px',
                border: innings === n ? '1px solid #3b82f6' : '1px solid #334155',
                background: innings === n ? '#2563eb' : 'transparent',
                color: innings === n ? 'white' : '#94a3b8',
                textDecoration: 'none',
              }}
            >{n}</Link>
          ))}
        </div>
        {/* 印刷ボタン */}
        <PrintButton />
      </div>

      {/* ─── Sheet ─── */}
      <div className="sheet">

        {/* ① ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '2mm', marginBottom: '1.5mm' }}>
          {/* TL マーク */}
          <div style={{ width: '6mm', height: '6mm', background: '#000', flexShrink: 0, marginTop: '1mm' }} />

          {/* タイトル + 試合情報 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              textAlign: 'center', fontFamily: font, fontWeight: 'bold',
              fontSize: '10.5pt', letterSpacing: '0.08em', color: '#000', marginBottom: '1mm',
            }}>
              BLITZ ソフトボール　スコア記入シート
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font, fontSize: '7pt' }}>
              <tbody>
                <tr>
                  <td style={{ ...cell, width: '6%', background: '#d8d8d8', fontWeight: 'bold', textAlign: 'center', fontSize: '6pt' }}>日付</td>
                  <td style={{ ...cell, width: '32%' }}>{dateStr}</td>
                  <td style={{ ...cell, width: '5%', background: '#d8d8d8', fontWeight: 'bold', textAlign: 'center', fontSize: '6pt' }}>vs</td>
                  <td style={{ ...cell, width: '26%' }}>{opponent || '　'}</td>
                  <td style={{ ...cell, width: '6%', background: '#d8d8d8', fontWeight: 'bold', textAlign: 'center', fontSize: '6pt' }}>結果</td>
                  <td style={{ ...cell, width: '25%' }}>
                    <span style={{ marginRight: '3mm', color: '#000' }}>□勝</span>
                    <span style={{ marginRight: '3mm', color: '#000' }}>□負</span>
                    <span style={{ color: '#000' }}>□引分</span>
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cell, background: '#d8d8d8', fontWeight: 'bold', textAlign: 'center', fontSize: '6pt' }}>球場</td>
                  <td style={{ ...cell }}>{location || '　'}</td>
                  <td style={{ ...cell, background: '#d8d8d8', fontWeight: 'bold', textAlign: 'center', fontSize: '6pt' }}>集合</td>
                  <td style={{ ...cell }}>{meetTime || '　　:　　'}</td>
                  <td style={{ ...cell, background: '#d8d8d8', fontWeight: 'bold', textAlign: 'center', fontSize: '6pt' }}>開始</td>
                  <td style={{ ...cell }}>{startTime || '　　:　　'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* TR マーク + QR */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5mm', flexShrink: 0 }}>
            <div style={{ width: '6mm', height: '6mm', background: '#000', alignSelf: 'flex-end' }} />
            {qrUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${encodeURIComponent(qrUrl)}`}
                  alt="QR"
                  width="52" height="52"
                  style={{ display: 'block' }}
                />
                <div style={{ fontFamily: font, fontSize: '5pt', color: '#000', textAlign: 'center', lineHeight: 1.4, maxWidth: '16mm' }}>
                  スキャンで<br />スコア入力へ
                </div>
              </>
            ) : (
              <div style={{ width: '52px', height: '52px', border: borderThin, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: font, fontSize: '5pt', color: '#666', textAlign: 'center', lineHeight: 1.3 }}>QR<br/>なし</span>
              </div>
            )}
          </div>
        </div>

        {/* ② イニングスコア + ③ 打者成績（1テーブルで縦揃え） */}
        <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font, fontSize: '7pt', marginBottom: '1.5mm' }}>
          <colgroup>
            <col style={{ width: pct(4.5) }} />
            <col style={{ width: pct(19) }} />
            <col style={{ width: pct(5.5) }} />
            {inningNums.map(n => <col key={n} style={{ width: pct(iColPct) }} />)}
            {STAT_COLS.map(c => <col key={c} style={{ width: pct(3) }} />)}
          </colgroup>

          {/* ─ イニングスコア ─ */}
          <thead>
            <tr>
              <th style={{ ...hdr, textAlign: 'left', paddingLeft: '1mm', fontSize: '6pt' }} colSpan={3}>
                イニングスコア
              </th>
              {inningNums.map(n => (
                <th key={n} style={{ ...hdr }}>{n}</th>
              ))}
              <th style={{ ...hdr }} colSpan={STAT_COLS.length}>計</th>
            </tr>
            <tr>
              <td style={{ ...cell, fontWeight: 'bold', background: '#ececec', height: '7mm', fontSize: '7pt' }} colSpan={3}>
                BLITZ
              </td>
              {inningNums.map(n => <td key={n} style={{ ...cell, height: '7mm' }} />)}
              <td style={{ ...cell, background: '#ececec', height: '7mm', fontWeight: 'bold' }} colSpan={STAT_COLS.length} />
            </tr>
            <tr>
              <td style={{ ...cell, background: '#ececec', height: '7mm', fontSize: '6.5pt' }} colSpan={3}>
                {opponent || '相手チーム'}
              </td>
              {inningNums.map(n => <td key={n} style={{ ...cell, height: '7mm' }} />)}
              <td style={{ ...cell, background: '#ececec', height: '7mm' }} colSpan={STAT_COLS.length} />
            </tr>

            {/* ─ 打者成績ヘッダー ─ */}
            <tr>
              <th style={{ ...hdr }}>#</th>
              <th style={{ ...hdr, textAlign: 'left', paddingLeft: '1mm' }}>選手名</th>
              <th style={{ ...hdr }}>守</th>
              {inningNums.map(n => (
                <th key={n} style={{ ...hdr }}>{n}</th>
              ))}
              {STAT_COLS.map(c => (
                <th key={c} style={{ ...hdr }}>{c}</th>
              ))}
            </tr>
          </thead>

          {/* ─ 打者行 ─ */}
          <tbody>
            {Array.from({ length: BATTER_COUNT }, (_, bi) => (
              <tr key={bi}>
                <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', background: '#ececec', fontSize: '8pt' }}>
                  {bi + 1}
                </td>
                <td style={{ ...cell, height: '16mm' }} />
                <td style={{ ...cell, textAlign: 'center' }} />
                {inningNums.map(n => (
                  <td key={n} style={{ ...cell, padding: 0 }}>
                    <div className="inn-cell">
                      <div className="ab1" />
                      <div className="ab2" />
                    </div>
                  </td>
                ))}
                {STAT_COLS.map(c => (
                  <td key={c} style={{ ...cell, background: '#ececec' }} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* ④ 投手成績 */}
        <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font, fontSize: '7pt', marginBottom: '1.5mm' }}>
          <colgroup>
            <col style={{ width: '24%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '9%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...hdr, textAlign: 'left', paddingLeft: '1mm' }}>投手名</th>
              <th style={{ ...hdr }}>投球回</th>
              <th style={{ ...hdr }}>失点</th>
              <th style={{ ...hdr }}>自責</th>
              <th style={{ ...hdr }}>被安打</th>
              <th style={{ ...hdr }}>K</th>
              <th style={{ ...hdr }}>BB</th>
              <th style={{ ...hdr }}>球数</th>
              <th style={{ ...hdr }}>勝敗S</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: PITCHER_ROWS }, (_, i) => (
              <tr key={i}>
                <td style={{ ...cell, height: '9mm' }} />
                {Array.from({ length: 8 }, (_, j) => (
                  <td key={j} style={{ ...cell, textAlign: 'center' }} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* ⑤ コード凡例 */}
        <div style={{
          border: '0.8pt solid #000',
          padding: '1.2mm 2mm',
          fontFamily: font,
          fontSize: '6pt',
          background: '#f5f5f5',
          color: '#000',
          lineHeight: 1.75,
          marginBottom: '1.5mm',
        }}>
          <div style={{ fontWeight: 'bold', fontSize: '7pt', marginBottom: '0.3mm' }}>コード凡例</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 4mm' }}>
            <div>
              <b>O</b>=アウト（三振/ゴロ/フライ）
              <b>1</b>=単打　<b>2</b>=二塁打　<b>3</b>=三塁打　<b>4</b>=本塁打
            </div>
            <div>
              <b>B</b>=四球　<b>D</b>=死球　<b>S</b>=犠打　<b>X</b>=犠飛
            </div>
            <div>
              数字サフィックス=打点　例: <b>12</b>=単打2打点　<b>41</b>=本塁打1打点
            </div>
            <div>
              <b>s</b>サフィックス=盗塁　例: <b>1s</b>=単打後盗塁
            </div>
          </div>
          <div style={{ marginTop: '0.3mm', fontSize: '5.5pt', color: '#333' }}>
            ▸ イニングセル【上段=1打席目 / 下段=2打席目（点線区切り）】　▸ 大文字小文字どちらでも可
          </div>
        </div>

        {/* ⑥ BL/BR 登録マーク */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ width: '6mm', height: '6mm', background: '#000' }} />
          <div style={{ textAlign: 'center', fontFamily: font, fontSize: '5.5pt', color: '#555' }}>
            {innings}回戦　BLITZ HP スコア記入シート
          </div>
          <div style={{ width: '6mm', height: '6mm', background: '#000' }} />
        </div>
      </div>
    </>
  )
}
