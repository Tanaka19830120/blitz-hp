import { prisma }       from '@/lib/prisma'
import Link            from 'next/link'
import { PrintButton } from '@/components/PrintButton'

const BATTER_COUNT = 9
const STAT_COLS = ['打', '安', '点', '盗', '四']

function pct(n: number) { return `${n.toFixed(3)}%` }

export default async function ScoreBookSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ scheduleId?: string }>
}) {
  const sp = await searchParams
  const innings = 7

  const schedule = sp.scheduleId
    ? await prisma.schedule.findUnique({ where: { id: sp.scheduleId } })
    : null

  const GUEST_NAMES: Record<string, string> = {
    '__guest_1': '助っ人1', '__guest_2': '助っ人2',
    '__guest_3': '助っ人3', '__guest_4': '助っ人4',
  }

  const slotNames = new Map<number, {
    first: string; second?: string
    jerseyNumber?: number | null; position?: string; secondPosition?: string
  }>()

  if (sp.scheduleId) {
    const dataSetting = await prisma.setting.findUnique({
      where: { key: `lineupData_${sp.scheduleId}` },
    })
    if (dataSetting?.value) {
      const data = JSON.parse(dataSetting.value) as {
        slots: Array<{ first: { playerId: string; position?: string }; second: { playerId: string; position?: string } }>
      }
      const allIds = data.slots.flatMap(s => [s.first.playerId, s.second.playerId])
        .filter(id => id && !id.startsWith('__guest_'))
      const users = allIds.length > 0
        ? await prisma.user.findMany({ where: { id: { in: allIds } }, select: { id: true, name: true, number: true } })
        : []
      const nameById   = new Map(users.map(u => [u.id, u.name ?? '']))
      const numberById = new Map(users.map(u => [u.id, u.number]))
      function getPlayerName(id: string): string {
        if (!id) return ''
        if (id.startsWith('__guest_')) return GUEST_NAMES[id] ?? '助っ人'
        return nameById.get(id) ?? ''
      }
      data.slots.forEach((slot, i) => {
        const firstName = getPlayerName(slot.first.playerId)
        if (!firstName) return
        const secondId   = slot.second.playerId
        const secondName = (secondId && secondId !== slot.first.playerId)
          ? getPlayerName(secondId) : undefined
        const jerseyNumber   = !slot.first.playerId.startsWith('__guest_')
          ? (numberById.get(slot.first.playerId) ?? null) : null
        const position       = slot.first.position  || undefined
        const secondPosition = (slot.second.position && slot.second.position !== slot.first.position)
          ? slot.second.position : undefined
        slotNames.set(i + 1, { first: firstName, second: secondName, jerseyNumber, position, secondPosition })
      })
    } else {
      const lineupItems = await prisma.lineup.findMany({
        where:   { scheduleId: sp.scheduleId, battingOrder: { not: null } },
        include: { user: { select: { name: true, number: true } } },
      })
      lineupItems.forEach(l => {
        if (l.battingOrder) slotNames.set(l.battingOrder, { first: l.user.name ?? '', jerseyNumber: l.user.number ?? null })
      })
    }
  }

  const dateStr = schedule
    ? new Date(schedule.date).toLocaleDateString('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
      })
    : '____年____月____日（　　）'

  const opponent  = schedule?.opponent  ?? ''
  const location  = schedule?.location  ?? ''
  const startTime = schedule?.startTime ?? ''

  const qrUrl = schedule
    ? `${process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/admin/game?scheduleId=${schedule.id}`
    : ''

  const fixedPct = 4.5 + 4 + 15 + 5
  const statPct  = STAT_COLS.length * 3
  const iColPct  = (100 - fixedPct - statPct) / innings

  const font    = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif'
  const border  = '1.2pt solid #000'
  const frameB  = '3.5pt solid #000'

  const cell: React.CSSProperties = {
    border, padding: '0', fontFamily: font, fontSize: '8pt',
    verticalAlign: 'middle', lineHeight: 1.1, color: '#000', position: 'relative',
  }
  const hdr: React.CSSProperties = {
    border, padding: '0.3mm 0.5mm', fontFamily: font,
    background: '#c8c8c8', fontWeight: 'bold', textAlign: 'center', fontSize: '8pt', color: '#000',
  }
  const hi: React.CSSProperties = {
    border, padding: '0 1mm', fontFamily: font, fontSize: '8pt',
    verticalAlign: 'middle', color: '#000', whiteSpace: 'nowrap',
  }

  const inningNums = Array.from({ length: innings }, (_, i) => i + 1)

  const OuterMark = () => (
    <div style={{
      width: '7mm', height: '7mm', border: '2mm solid #000', background: 'white',
      boxSizing: 'border-box', flexShrink: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: '1.5mm', height: '1.5mm', background: '#000', flexShrink: 0 }} />
    </div>
  )

  // ── ガイド（2枚目）用スタイル ──
  const gBorder  = '1pt solid #333'
  const gHdrBg   = '#c8c8c8'
  const gCell: React.CSSProperties = {
    border: gBorder, padding: '0.3mm 1mm', fontFamily: font, fontSize: '7pt',
    verticalAlign: 'middle', color: '#000',
  }
  const gHdr: React.CSSProperties = {
    border: gBorder, padding: '0.3mm 0.5mm', fontFamily: font, fontSize: '7pt',
    background: gHdrBg, fontWeight: 'bold', textAlign: 'center', color: '#000',
  }
  const gSecTitle: React.CSSProperties = {
    fontFamily: font, fontSize: '8.5pt', fontWeight: 'bold', color: '#000',
    borderBottom: '1.5pt solid #000', paddingBottom: '0.3mm', marginBottom: '1mm', marginTop: '2.5mm',
  }
  const ON_COLOR   = '#e8f5e9'
  const OUT_COLOR  = '#fff5f5'
  const SACR_COLOR = '#fffde7'
  const EXAMPLES = [
    { order: 1, name: 'たなか', inn: ['1', 'O', '12', 'B', '2', 'O', '4'] },
    { order: 2, name: 'やまだ', inn: ['B', 'O', '1s', 'O', 'X', 'O', 'S'] },
    { order: 3, name: 'すずき', inn: ['4', 'O', 'B', '1,O', 'O', 'D', '3'] },
  ]
  function cellBg(code: string) {
    const c = code.trim().toUpperCase().split(',')[0][0]
    if ('1234'.includes(c) || c === 'B' || c === 'D') return ON_COLOR
    if (c === 'S' || c === 'X') return SACR_COLOR
    return OUT_COLOR
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { size: A4 landscape; margin: 6mm; }
          body { visibility: hidden !important; background: white !important;
                 margin: 0 !important; padding: 0 !important; }
          .print-wrap { visibility: visible !important; position: absolute !important;
                        top: 0 !important; left: 0 !important; width: 100% !important; }
          .print-wrap * { visibility: visible !important; }
          .sheet, .sheet-2 {
            box-shadow: none !important; margin: 0 !important; padding: 0 !important;
            min-height: unset !important; width: 100% !important;
            display: block !important;
          }
          .no-print { display: none !important; }
          .page-break { break-before: page !important; page-break-before: always !important; }
        }
        @media screen {
          body { background: #8a9ab0 !important; }
          .sheet, .sheet-2 {
            width: 297mm; min-height: 210mm;
            margin: 0 auto; padding: 4mm;
            background: white;
            box-shadow: 0 4px 20px rgba(0,0,0,0.35);
            box-sizing: border-box;
          }
          .sheet-2 { margin-top: 12px; }
        }
        .inn-cell {
          height: 14mm; min-height: 14mm;
          overflow: hidden; display: flex; flex-direction: column;
        }
        .inn-ab {
          flex: 1; display: flex; align-items: stretch; min-height: 0;
        }
        .inn-ab + .inn-ab { border-top: 0.5pt dashed #aaa; }
        .inn-code { flex: 1; min-width: 0; }
        .inn-rbi {
          width: 7mm; flex-shrink: 0; border-left: 0.5pt solid #ccc;
          display: flex; align-items: flex-end; justify-content: center; padding-bottom: 0.3mm;
        }
        .inn-rbi-label { font-size: 3.5pt; color: #bbb; font-family: Arial, sans-serif; font-weight: bold; line-height: 1; }
      `}} />

      {/* Controls */}
      <div className="no-print" style={{
        width: '297mm', margin: '0 auto', marginTop: '4rem', padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
        background: '#1e293b', borderBottom: '1px solid #334155',
      }}>
        <Link href="/admin/game" style={{ color: '#94a3b8', fontSize: '13px', textDecoration: 'none' }}>← 試合入力</Link>
        <span style={{ color: '#e2e8f0', fontWeight: 'bold', fontSize: '14px' }}>スコア記入シート（7回）</span>
        <PrintButton />
      </div>

      <div className="print-wrap">
      {/* ─── 1枚目: スコアシート ─── */}
      <div className="sheet">

        {/* ① ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2mm', height: '8mm', minHeight: '8mm' }}>
          <OuterMark />
          <span style={{ fontFamily: font, fontWeight: 'bold', fontSize: '11pt',
            color: '#000', flexShrink: 0, whiteSpace: 'nowrap', paddingRight: '1mm' }}>BLITZ</span>
          <table style={{ borderCollapse: 'collapse', flex: 1, fontFamily: font }}>
            <tbody>
              <tr>
                <td style={{ ...hi, background: '#d8d8d8', fontWeight: 'bold' }}>日付</td>
                <td style={{ ...hi, minWidth: '26mm' }}>{dateStr}</td>
                <td style={{ ...hi, background: '#d8d8d8', fontWeight: 'bold' }}>vs</td>
                <td style={{ ...hi, minWidth: '14mm' }}>{opponent || '　　　'}</td>
                <td style={{ ...hi, background: '#d8d8d8', fontWeight: 'bold' }}>球場</td>
                <td style={{ ...hi, minWidth: '14mm' }}>{location || '　　　'}</td>
                <td style={{ ...hi, background: '#d8d8d8', fontWeight: 'bold' }}>開始</td>
                <td style={{ ...hi, minWidth: '9mm' }}>{startTime || '　:　'}</td>
                <td style={{ ...hi, background: '#d8d8d8', fontWeight: 'bold' }}>結果</td>
                <td style={{ ...hi }}>□勝　□負　□引</td>
              </tr>
            </tbody>
          </table>
          <OuterMark />
        </div>

        {/* ② 本体テーブル */}
        <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: pct(4.5) }} />
            <col style={{ width: pct(4) }} />
            <col style={{ width: pct(15) }} />
            <col style={{ width: pct(5) }} />
            {inningNums.map(n => <col key={n} style={{ width: pct(iColPct) }} />)}
            {STAT_COLS.map(c => <col key={c} style={{ width: pct(3) }} />)}
          </colgroup>
          <thead>
            <tr>
              <td style={{ ...cell, height: '5mm', padding: 0 }} colSpan={4}>
                <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
                  <div style={{ padding: '0 1.5mm', display: 'flex', alignItems: 'center', background: '#e4e4e4', fontWeight: 'bold', fontSize: '8pt', whiteSpace: 'nowrap', flexShrink: 0 }}>先攻</div>
                  <div style={{ flex: 1, background: 'white', borderLeft: '0.8pt solid #aaa' }} />
                </div>
              </td>
              {inningNums.map(n => <td key={n} style={{ ...cell, height: '5mm', background: 'white' }} />)}
              <td style={{ ...cell, height: '5mm', background: '#e4e4e4', fontWeight: 'bold', textAlign: 'center', fontSize: '8pt' }}>計</td>
              <td style={{ ...cell, height: '5mm', background: 'white' }} colSpan={STAT_COLS.length - 1} />
            </tr>
            <tr>
              <td style={{ ...cell, height: '5mm', padding: 0 }} colSpan={4}>
                <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
                  <div style={{ padding: '0 1.5mm', display: 'flex', alignItems: 'center', background: '#e4e4e4', fontWeight: 'bold', fontSize: '8pt', whiteSpace: 'nowrap', flexShrink: 0 }}>後攻</div>
                  <div style={{ flex: 1, background: 'white', borderLeft: '0.8pt solid #aaa' }} />
                </div>
              </td>
              {inningNums.map(n => <td key={n} style={{ ...cell, height: '5mm', background: 'white' }} />)}
              <td style={{ ...cell, height: '5mm', background: '#e4e4e4', fontWeight: 'bold', textAlign: 'center', fontSize: '8pt' }}>計</td>
              <td style={{ ...cell, height: '5mm', background: 'white' }} colSpan={STAT_COLS.length - 1} />
            </tr>
            <tr>
              <th style={{ ...hdr, fontSize: '8pt' }}>#</th>
              <th style={{ ...hdr, fontSize: '8pt' }}>番</th>
              <th style={{ ...hdr, textAlign: 'left', paddingLeft: '1.5mm', fontSize: '8pt' }}>選手名</th>
              <th style={{ ...hdr, fontSize: '8pt' }}>守</th>
              {inningNums.map(n => (
                <th key={n} style={{
                  ...hdr,
                  borderTop: frameB,
                  borderLeft: n === 1 ? frameB : border,
                  borderRight: n === innings ? frameB : border,
                }}>{n}</th>
              ))}
              {STAT_COLS.map(c => <th key={c} style={{ ...hdr }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: BATTER_COUNT }, (_, bi) => {
              const slotInfo = slotNames.get(bi + 1)
              const isLast = bi === BATTER_COUNT - 1
              return (
                <tr key={bi}>
                  <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold',
                    background: '#ececec', fontSize: '14pt', height: '14mm', padding: '0.2mm' }}>
                    {bi + 1}
                  </td>
                  <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold',
                    background: '#f5f5f5', fontSize: '13pt', height: '14mm', padding: '0.2mm' }}>
                    {slotInfo?.jerseyNumber != null ? slotInfo.jerseyNumber : ''}
                  </td>
                  <td style={{ ...cell, height: '14mm', verticalAlign: 'middle', padding: '0.5mm 1.5mm' }}>
                    {slotInfo?.first ? (
                      slotInfo.second ? (
                        <div style={{ fontSize: '8pt', lineHeight: 1.4 }}>
                          <div style={{ fontWeight: 'bold', borderBottom: '0.4pt dashed #aaa', paddingBottom: '0.5mm', marginBottom: '0.5mm' }}>
                            <span style={{ fontSize: '6.5pt', color: '#000' }}>前:</span>{slotInfo.first}
                          </div>
                          <div style={{ fontWeight: 'bold' }}>
                            <span style={{ fontSize: '6.5pt', color: '#000' }}>後:</span>{slotInfo.second}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '10pt', fontWeight: 'bold' }}>{slotInfo.first}</div>
                      )
                    ) : null}
                  </td>
                  <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold',
                    fontSize: '10pt', height: '14mm', padding: '0.2mm' }}>
                    <span style={{ display: 'block' }}>{slotInfo?.position ?? ''}</span>
                    {slotInfo?.secondPosition && (
                      <span style={{ fontSize: '7pt', fontWeight: 'normal', color: '#000' }}>
                        →{slotInfo.secondPosition}
                      </span>
                    )}
                  </td>
                  {inningNums.map(n => (
                    <td key={n} style={{
                      ...cell, padding: 0,
                      borderLeft:   n === 1       ? frameB : border,
                      borderRight:  n === innings ? frameB : border,
                      borderBottom: isLast        ? frameB : border,
                    }}>
                      <div className="inn-cell">
                        <div className="inn-ab">
                          <div className="inn-code" />
                          <div className="inn-rbi"><span className="inn-rbi-label">点</span></div>
                        </div>
                        <div className="inn-ab">
                          <div className="inn-code" />
                          <div className="inn-rbi"><span className="inn-rbi-label">点</span></div>
                        </div>
                      </div>
                    </td>
                  ))}
                  {STAT_COLS.map(c => (
                    <td key={c} style={{ ...cell, background: '#f0f0f0', height: '14mm' }} />
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* ③ 投手成績 ＋ QRコード */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '3mm' }}>
          <table style={{ borderCollapse: 'collapse', flex: 1, minWidth: 0, fontFamily: font, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '26%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} /><col style={{ width: '18%' }} />
            </colgroup>
            <thead>
              <tr>
                <th colSpan={8} style={{ ...hdr, textAlign: 'left', paddingLeft: '1.5mm', fontSize: '8pt' }}>投手成績</th>
              </tr>
              <tr>
                {['選手名', '投球回', '投球数', '失点', '自責', '安打', '三振', '勝敗・備考'].map(h => (
                  <th key={h} style={{ ...hdr, fontSize: '7pt', padding: '0.3mm' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1].map(ri => (
                <tr key={ri}>
                  {Array.from({ length: 8 }, (_, ci) => (
                    <td key={ci} style={{ ...cell, height: '4mm', background: 'white' }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {qrUrl && (
            <div style={{ flexShrink: 0, width: '22mm', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: '0.5mm', paddingTop: '0.5mm' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrUrl)}`}
                alt="QR"
                style={{ width: '18mm', height: '18mm', display: 'block' }}
              />
              <div style={{ fontFamily: font, fontSize: '4.5pt', color: '#444', textAlign: 'center', lineHeight: 1.3 }}>
                スキャンで入力
              </div>
            </div>
          )}
        </div>

        {/* ④ 簡易凡例（正しいコード体系） */}
        <div style={{ marginTop: '0.5mm', fontFamily: font, fontSize: '6.5pt', color: '#222', lineHeight: 1.4 }}>
          <div style={{ display: 'flex', gap: '2.5mm', flexWrap: 'wrap', borderTop: '0.7pt solid #aaa', paddingTop: '0.5mm', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', color: '#555', flexShrink: 0 }}>【打撃コード】</span>
            {[
              ['O', 'アウト'], ['1', '単打'], ['2', '二塁打'], ['3', '三塁打'], ['4', '本塁打'],
              ['B', '四球'], ['D', '死球'], ['S', '犠打'], ['X', '犠飛'],
            ].map(([code, label]) => (
              <span key={code}><b style={{ fontFamily: 'monospace' }}>{code}</b>={label}</span>
            ))}
            <span style={{ borderLeft: '0.5pt solid #ccc', paddingLeft: '2.5mm', flexShrink: 0 }}>
              <b>打点</b>=右の欄に数字（例:単打で2点→コード<b style={{ fontFamily: 'monospace' }}>1</b>、打点欄に<b style={{ fontFamily: 'monospace' }}>2</b>）
            </span>
            <span><b>2打席目</b>=下の段に記入</span>
            <span style={{ borderLeft: '0.5pt solid #ccc', paddingLeft: '2.5mm', fontWeight: 'bold', color: '#555', flexShrink: 0 }}>【守備】</span>
            {[['1','投'],['2','捕'],['3','一'],['4','二'],['5','三'],['6','遊'],['7','左'],['8','中'],['9','右']].map(([n,p]) => (
              <span key={n}><b>{n}</b>={p}</span>
            ))}
            <span style={{ borderLeft: '0.5pt solid #ccc', paddingLeft: '2.5mm', color: '#666' }}>
              ※詳しい記入例は2枚目参照
            </span>
          </div>
        </div>

        {/* ⑤ フッター: 外角 BL/BR */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5mm' }}>
          <OuterMark />
          <div style={{ flex: 1 }} />
          <OuterMark />
        </div>
      </div>

      {/* ─── 2枚目: スコア記入ガイド ─── */}
      <div className="sheet-2 page-break">

        {/* タイトル */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '3mm',
          marginBottom: '2mm', borderBottom: '2pt solid #000', paddingBottom: '1mm' }}>
          <span style={{ fontFamily: font, fontSize: '12pt', fontWeight: 'bold', color: '#000' }}>
            BLITZ スコア記入ガイド
          </span>
          <span style={{ fontFamily: font, fontSize: '7.5pt', color: '#555' }}>
            ― 打席欄の書き方・コード一覧・記入例
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5mm' }}>

          {/* ── 左カラム ── */}
          <div>
            {/* ① コード一覧 */}
            <div style={gSecTitle}>① 打席コード一覧</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font }}>
              <thead>
                <tr>
                  <th style={{ ...gHdr, width: '14%' }}>コード</th>
                  <th style={{ ...gHdr, width: '26%' }}>意味</th>
                  <th style={{ ...gHdr }}>説明</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['O', 'アウト', '三振・ゴロ・フライ問わず、アウトはすべて O（アルファベット）'],
                  ['1', '単打（安打）', 'シングルヒット'],
                  ['2', '二塁打', 'ツーベース'],
                  ['3', '三塁打', 'スリーベース'],
                  ['4', '本塁打', 'ホームラン'],
                  ['B', '四球', 'フォアボール。打数にカウントされない'],
                  ['D', '死球', 'デッドボール。打数にカウントされない'],
                  ['S', '犠打', 'バント犠打。打数にカウントされない'],
                  ['X', '犠飛', 'サクリファイスフライ。打数にカウントされない'],
                ].map(([code, name, desc]) => (
                  <tr key={code}>
                    <td style={{ ...gCell, textAlign: 'center', fontWeight: 'bold', background: '#f5f5f5', fontSize: '9pt', fontFamily: 'monospace' }}>{code}</td>
                    <td style={{ ...gCell, fontWeight: 'bold', fontSize: '7pt' }}>{name}</td>
                    <td style={{ ...gCell, fontSize: '6.5pt', color: '#333' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ② 打席欄の書き方 */}
            <div style={gSecTitle}>② 打席欄の書き方</div>

            {/* 構造図 */}
            <div style={{ display: 'flex', gap: '4mm', alignItems: 'flex-start', marginBottom: '1.5mm' }}>

              {/* 空欄の構造図（ラベル付き） */}
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: '5.5pt', fontFamily: font, color: '#555', textAlign: 'center', marginBottom: '0.5mm' }}>【構造】</div>
                <div style={{ position: 'relative' }}>
                  <div style={{ border: '1.5pt solid #333', display: 'flex', flexDirection: 'column', width: '30mm', height: '20mm' }}>
                    <div style={{ flex: 1, display: 'flex', borderBottom: '1pt dashed #888' }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '5.5pt', fontFamily: font, color: '#888' }}>コード</span>
                      </div>
                      <div style={{ width: '7mm', borderLeft: '0.8pt solid #bbb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '5pt', fontFamily: font, color: '#aaa' }}>打点</span>
                      </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex' }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '5.5pt', fontFamily: font, color: '#bbb' }}>コード</span>
                      </div>
                      <div style={{ width: '7mm', borderLeft: '0.8pt solid #bbb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '5pt', fontFamily: font, color: '#bbb' }}>打点</span>
                      </div>
                    </div>
                  </div>
                  {/* ラベル: 右側 */}
                  <div style={{ position: 'absolute', right: '-20mm', top: '0', height: '50%', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '5.5pt', fontFamily: font, color: '#000', whiteSpace: 'nowrap' }}>← 上段: 1打席目</span>
                  </div>
                  <div style={{ position: 'absolute', right: '-20mm', bottom: '0', height: '50%', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '5.5pt', fontFamily: font, color: '#888', whiteSpace: 'nowrap' }}>← 下段: 2打席目</span>
                  </div>
                </div>
              </div>

              {/* 記入例の図（単打・打点2） */}
              <div style={{ flexShrink: 0, marginLeft: '22mm' }}>
                <div style={{ fontSize: '5.5pt', fontFamily: font, color: '#555', textAlign: 'center', marginBottom: '0.5mm' }}>【例: 単打・打点2】</div>
                <div style={{ border: '1.5pt solid #333', display: 'flex', flexDirection: 'column', width: '22mm', height: '20mm', background: ON_COLOR }}>
                  <div style={{ flex: 1, display: 'flex', borderBottom: '1pt dashed #888' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '13pt', fontFamily: 'monospace', fontWeight: 'bold', color: '#000' }}>1</span>
                    </div>
                    <div style={{ width: '7mm', borderLeft: '0.8pt solid #bbb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '10pt', fontFamily: 'monospace', fontWeight: 'bold', color: '#c00' }}>2</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, display: 'flex', background: 'white' }}>
                    <div style={{ flex: 1 }} />
                    <div style={{ width: '7mm', borderLeft: '0.8pt solid #bbb' }} />
                  </div>
                </div>
              </div>

              {/* 記入例の図（同イニング2打席） */}
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: '5.5pt', fontFamily: font, color: '#555', textAlign: 'center', marginBottom: '0.5mm' }}>【例: 同イニング2打席】</div>
                <div style={{ border: '1.5pt solid #333', display: 'flex', flexDirection: 'column', width: '22mm', height: '20mm' }}>
                  <div style={{ flex: 1, display: 'flex', background: OUT_COLOR, borderBottom: '1pt dashed #888' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '13pt', fontFamily: 'monospace', fontWeight: 'bold', color: '#000' }}>O</span>
                    </div>
                    <div style={{ width: '7mm', borderLeft: '0.8pt solid #bbb' }} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', background: ON_COLOR }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '13pt', fontFamily: 'monospace', fontWeight: 'bold', color: '#000' }}>1</span>
                    </div>
                    <div style={{ width: '7mm', borderLeft: '0.8pt solid #bbb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '10pt', fontFamily: 'monospace', fontWeight: 'bold', color: '#c00' }}>1</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ fontFamily: font, fontSize: '6.5pt', lineHeight: 1.8, color: '#222', marginTop: '1mm' }}>
              <div>・<b>上段（1打席目）</b>：コードを左側に書き、打点があれば右の打点欄に数字を書く</div>
              <div>・<b>下段（2打席目）</b>：同じイニングに2打席回ってきた場合のみ使用する</div>
              <div>・<b>打点欄（右半分）</b>：得点が入った打席のみ、点数を数字で記入する</div>
            </div>

            {/* ③ 成績欄の集計 */}
            <div style={gSecTitle}>③ 成績欄（右端）の集計方法</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font }}>
              <thead>
                <tr>
                  <th style={{ ...gHdr, width: '8%' }}>欄</th>
                  <th style={{ ...gHdr, width: '18%' }}>内容</th>
                  <th style={gHdr}>数え方</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['打', '打数', 'O, 1, 2, 3, 4 の数。四球B・死球D・犠打S・犠飛X は除く'],
                  ['安', '安打数', '1（単打）, 2（二塁打）, 3（三塁打）, 4（本塁打）の数'],
                  ['点', '打点', '打点欄（右半分）に書いた数字の合計'],
                  ['盗', '盗塁', '盗塁に成功した回数（別途マークや欄に記入）'],
                  ['四', '四死球', '四球B と 死球D の合計数'],
                ].map(([col, name, desc]) => (
                  <tr key={col}>
                    <td style={{ ...gCell, textAlign: 'center', fontWeight: 'bold', background: '#f5f5f5', fontSize: '9pt', fontFamily: 'monospace' }}>{col}</td>
                    <td style={{ ...gCell, fontWeight: 'bold', fontSize: '7pt' }}>{name}</td>
                    <td style={{ ...gCell, fontSize: '6.5pt', color: '#333' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── 右カラム ── */}
          <div>
            {/* ④ 記入例テーブル（ビジュアルセル） */}
            <div style={gSecTitle}>④ 記入例（3名・7イニング）</div>
            {(() => {
              type InnCell = { ab1?: string; rbi1?: string; ab2?: string; rbi2?: string }
              const players: { order: number; name: string; inn: InnCell[] }[] = [
                { order: 1, name: 'たなか', inn: [
                  { ab1: '1' },
                  { ab1: 'O' },
                  { ab1: '1', rbi1: '2' },
                  { ab1: 'B' },
                  { ab1: '2' },
                  { ab1: 'O' },
                  { ab1: '4', rbi1: '1' },
                ]},
                { order: 2, name: 'やまだ', inn: [
                  { ab1: 'B' },
                  { ab1: 'O' },
                  { ab1: '1' },
                  { ab1: 'O', ab2: '1', rbi2: '1' },
                  { ab1: 'X', rbi1: '1' },
                  { ab1: 'O' },
                  { ab1: 'S' },
                ]},
                { order: 3, name: 'すずき', inn: [
                  { ab1: '4', rbi1: '3' },
                  { ab1: 'O' },
                  { ab1: 'D' },
                  { ab1: 'O' },
                  { ab1: '3' },
                  { ab1: 'O' },
                  { ab1: '1', rbi1: '1' },
                ]},
              ]
              function abBg(code?: string) {
                if (!code) return 'white'
                if (code === 'O') return OUT_COLOR
                if (['1','2','3','4','B','D'].includes(code)) return ON_COLOR
                if (['S','X'].includes(code)) return SACR_COLOR
                return 'white'
              }
              const RBI_W = '5.5mm'
              return (
                <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font, tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '12%' }} />
                    {[1,2,3,4,5,6,7].map(n => <col key={n} style={{ width: `${83/7}%` }} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ ...gHdr, fontSize: '6.5pt' }}>#</th>
                      <th style={{ ...gHdr, fontSize: '6.5pt' }}>名前</th>
                      {[1,2,3,4,5,6,7].map(n => <th key={n} style={{ ...gHdr, fontSize: '6.5pt' }}>{n}回</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map(({ order, name, inn }) => (
                      <tr key={order}>
                        <td style={{ ...gCell, textAlign: 'center', fontWeight: 'bold', background: '#ececec', fontSize: '7pt', padding: 0, verticalAlign: 'middle', paddingLeft: '0.5mm' }}>{order}</td>
                        <td style={{ ...gCell, fontWeight: 'bold', fontSize: '7pt', padding: '0 0.5mm' }}>{name}</td>
                        {inn.map((c, i) => (
                          <td key={i} style={{ ...gCell, padding: 0 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', height: '12mm' }}>
                              {/* 上段: 1打席目 */}
                              <div style={{ flex: 1, display: 'flex', borderBottom: '0.5pt dashed #999', background: abBg(c.ab1) }}>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontFamily: 'monospace', fontSize: '9pt', fontWeight: 'bold', color: '#000' }}>
                                  {c.ab1 ?? ''}
                                </div>
                                <div style={{ width: RBI_W, flexShrink: 0, borderLeft: '0.5pt solid #ccc',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '8pt', fontFamily: 'monospace', fontWeight: 'bold', color: '#c00' }}>
                                  {c.rbi1 ?? ''}
                                </div>
                              </div>
                              {/* 下段: 2打席目 */}
                              <div style={{ flex: 1, display: 'flex', background: abBg(c.ab2) }}>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontFamily: 'monospace', fontSize: '9pt', fontWeight: 'bold', color: '#000' }}>
                                  {c.ab2 ?? ''}
                                </div>
                                <div style={{ width: RBI_W, flexShrink: 0, borderLeft: '0.5pt solid #ccc',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '8pt', fontFamily: 'monospace', fontWeight: 'bold', color: '#c00' }}>
                                  {c.rbi2 ?? ''}
                                </div>
                              </div>
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })()}

            <div style={{ fontFamily: font, fontSize: '6pt', color: '#555', marginTop: '0.5mm', marginBottom: '1.5mm', display: 'flex', gap: '3mm' }}>
              <span style={{ background: ON_COLOR, padding: '0 1mm', border: '0.5pt solid #aaa' }}>緑=出塁</span>
              <span style={{ background: SACR_COLOR, padding: '0 1mm', border: '0.5pt solid #aaa' }}>黄=犠打飛</span>
              <span style={{ background: OUT_COLOR, padding: '0 1mm', border: '0.5pt solid #aaa' }}>赤=アウト</span>
              <span style={{ color: '#c00', fontWeight: 'bold' }}>赤数字=打点</span>
            </div>

            {/* ⑤ 記入例の解説 */}
            <div style={gSecTitle}>⑤ 記入例の解説</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font }}>
              <thead>
                <tr>
                  <th style={{ ...gHdr, width: '20%' }}>選手・回</th>
                  <th style={{ ...gHdr, width: '22%' }}>書いた内容</th>
                  <th style={gHdr}>意味</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['たなか 1回', '上段: 1', '単打（安打）'],
                  ['たなか 3回', '上段: 1 / 打点: 2', '単打・打点2（2点タイムリーヒット）'],
                  ['たなか 7回', '上段: 4 / 打点: 1', '本塁打・打点1（ソロホームラン）'],
                  ['やまだ 4回', '上段: O / 下段: 1 / 打点: 1', '同イニング2打席: 1打席目アウト→2打席目単打・打点1'],
                  ['やまだ 5回', '上段: X / 打点: 1', '犠飛・打点1（フライで1点入る）'],
                  ['やまだ 7回', '上段: S', '犠打（バント）。打点なし'],
                  ['すずき 1回', '上段: 4 / 打点: 3', '本塁打・打点3（3ランホームラン）'],
                  ['すずき 3回', '上段: D', '死球で出塁。打点なし'],
                ].map(([who, written, meaning]) => (
                  <tr key={who}>
                    <td style={{ ...gCell, fontSize: '6pt', fontWeight: 'bold' }}>{who}</td>
                    <td style={{ ...gCell, fontSize: '6pt', fontFamily: 'monospace' }}>{written}</td>
                    <td style={{ ...gCell, fontSize: '6pt' }}>{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </div>{/* /print-wrap */}
    </>
  )
}
