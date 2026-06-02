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
  const meetTime  = schedule?.meetTime  ?? ''
  const startTime = schedule?.startTime ?? ''

  const qrUrl = schedule
    ? `${process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/admin/game?scheduleId=${schedule.id}`
    : ''

  // A4横 コンテンツ幅 285mm
  // 固定: 打順4.5+番4+名前15+守5 = 28.5%
  // 成績 5×3% = 15%
  // イニング: 残り / 7
  const fixedPct = 4.5 + 4 + 15 + 5
  const statPct  = STAT_COLS.length * 3
  const iColPct  = (100 - fixedPct - statPct) / innings

  const font    = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif'
  const border  = '1.2pt solid #000'
  const frameB  = '3.5pt solid #000'  // イニンググリッド外枠（OCRマーカー兼用）

  const cell: React.CSSProperties = {
    border,
    padding: '0',
    fontFamily: font,
    fontSize: '8pt',
    verticalAlign: 'middle',
    lineHeight: 1.1,
    color: '#000',
    position: 'relative',
  }
  const hdr: React.CSSProperties = {
    border,
    padding: '0.3mm 0.5mm',
    fontFamily: font,
    background: '#c8c8c8',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: '8pt',
    color: '#000',
  }
  // ヘッダー情報テーブルセル
  const hi: React.CSSProperties = {
    border,
    padding: '0 1mm',
    fontFamily: font,
    fontSize: '8pt',
    verticalAlign: 'middle',
    color: '#000',
    whiteSpace: 'nowrap',
  }

  const inningNums = Array.from({ length: innings }, (_, i) => i + 1)

  // 外角マーカー（4隅）— OCR位置補正用
  const OuterMark = () => (
    <div style={{
      width: '7mm', height: '7mm',
      border: '2mm solid #000', background: 'white',
      boxSizing: 'border-box', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: '1.5mm', height: '1.5mm', background: '#000', flexShrink: 0 }} />
    </div>
  )

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { size: A4 landscape; margin: 6mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important;
                       height: auto !important; overflow: visible !important; }
          .no-print { display: none !important; }
          .sheet {
            box-shadow: none !important; width: 100% !important;
            margin: 0 !important; padding: 0 !important;
            min-height: unset !important; page-break-after: avoid;
            page-break-inside: avoid; overflow: visible !important;
          }
        }
        @media screen {
          body { background: #8a9ab0 !important; }
          .sheet {
            width: 297mm; min-height: 210mm;
            margin: 0 auto; padding: 4mm;
            background: white;
            box-shadow: 0 4px 20px rgba(0,0,0,0.35);
            box-sizing: border-box;
          }
        }
        /* イニングセル: 一巡目（上）＋二巡目（下）の2段構成 */
        .inn-cell {
          height: 15mm;
          min-height: 15mm;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        /* 各打席エリア（flex行） */
        .inn-ab {
          flex: 1;
          display: flex;
          align-items: stretch;
          min-height: 0;
        }
        /* 二巡目の仕切り線 */
        .inn-ab + .inn-ab {
          border-top: 0.5pt dashed #aaa;
        }
        /* 打撃コード記入エリア（左） */
        .inn-code {
          flex: 1;
          min-width: 0;
        }
        /* 打点記入エリア（右）: 縦線区切り＋小さい"点"ラベル */
        .inn-rbi {
          width: 7mm;
          flex-shrink: 0;
          border-left: 0.5pt solid #ccc;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 0.3mm;
        }
        .inn-rbi-label {
          font-size: 3.5pt;
          color: #bbb;
          font-family: Arial, sans-serif;
          font-weight: bold;
          line-height: 1;
        }
      `}} />

      {/* ─── Controls (screen only) ─── */}
      <div className="no-print" style={{
        width: '297mm', margin: '0 auto', marginTop: '4rem', padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
        background: '#1e293b', borderBottom: '1px solid #334155',
      }}>
        <Link href="/admin/game" style={{ color: '#94a3b8', fontSize: '13px', textDecoration: 'none' }}>← 試合入力</Link>
        <span style={{ color: '#e2e8f0', fontWeight: 'bold', fontSize: '14px' }}>スコア記入シート（7回）</span>
        <PrintButton />
      </div>

      {/* ─── Sheet ─── */}
      <div className="sheet">

        {/* ① ヘッダー 1行: 外角TL/TR ＋ タイトル ＋ 試合情報 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '2mm',
          height: '8mm', minHeight: '8mm',
        }}>
          <OuterMark />

          <span style={{ fontFamily: font, fontWeight: 'bold', fontSize: '11pt',
            color: '#000', flexShrink: 0, whiteSpace: 'nowrap', paddingRight: '1mm' }}>
            BLITZ
          </span>

          {/* 試合情報: 1行に全項目 */}
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

        {/* ② 本体テーブル: イニングスコア＋打者成績 */}
        <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: pct(4.5) }} />  {/* 打順 */}
            <col style={{ width: pct(4) }} />    {/* 背番号 */}
            <col style={{ width: pct(15) }} />   {/* 選手名 */}
            <col style={{ width: pct(5) }} />    {/* 守 */}
            {inningNums.map(n => <col key={n} style={{ width: pct(iColPct) }} />)}
            {STAT_COLS.map(c => <col key={c} style={{ width: pct(3) }} />)}
          </colgroup>

          <thead>
            {/* イニングスコア: 先攻 */}
            <tr>
              <td style={{ ...cell, height: '5mm', background: '#e4e4e4',
                fontWeight: 'bold', textAlign: 'center', fontSize: '8pt' }} colSpan={4}>先攻</td>
              {inningNums.map(n => (
                <td key={n} style={{ ...cell, height: '5mm', background: 'white' }} />
              ))}
              {/* 合計点: グレーの「計」ラベル(1列) + 記入欄(残り列) */}
              <td style={{ ...cell, height: '5mm', background: '#e4e4e4',
                fontWeight: 'bold', textAlign: 'center', fontSize: '8pt' }}>計</td>
              <td style={{ ...cell, height: '5mm', background: 'white' }}
                colSpan={STAT_COLS.length - 1} />
            </tr>
            {/* イニングスコア: 後攻 */}
            <tr>
              <td style={{ ...cell, height: '5mm', background: '#e4e4e4',
                fontWeight: 'bold', textAlign: 'center', fontSize: '8pt' }} colSpan={4}>後攻</td>
              {inningNums.map(n => (
                <td key={n} style={{ ...cell, height: '5mm', background: 'white' }} />
              ))}
              <td style={{ ...cell, height: '5mm', background: '#e4e4e4',
                fontWeight: 'bold', textAlign: 'center', fontSize: '8pt' }}>計</td>
              <td style={{ ...cell, height: '5mm', background: 'white' }}
                colSpan={STAT_COLS.length - 1} />
            </tr>

            {/* 打者列ヘッダー */}
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

          {/* 打者行 */}
          <tbody>
            {Array.from({ length: BATTER_COUNT }, (_, bi) => {
              const slotInfo = slotNames.get(bi + 1)
              const isLast = bi === BATTER_COUNT - 1

              return (
                <tr key={bi}>
                  {/* 打順 */}
                  <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold',
                    background: '#ececec', fontSize: '14pt',
                    height: '15mm', padding: '0.2mm' }}>
                    {bi + 1}
                  </td>
                  {/* 背番号 */}
                  <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold',
                    background: '#f5f5f5', fontSize: '13pt',
                    height: '15mm', padding: '0.2mm' }}>
                    {slotInfo?.jerseyNumber != null ? slotInfo.jerseyNumber : ''}
                  </td>
                  {/* 選手名 */}
                  <td style={{ ...cell, height: '15mm', verticalAlign: 'middle', padding: '0.5mm 1.5mm' }}>
                    {slotInfo?.first ? (
                      slotInfo.second ? (
                        <div style={{ fontSize: '8pt', lineHeight: 1.4 }}>
                          <div style={{ fontWeight: 'bold', borderBottom: '0.4pt dashed #aaa',
                            paddingBottom: '0.5mm', marginBottom: '0.5mm' }}>
                            <span style={{ fontSize: '6.5pt', color: '#000' }}>前:</span>{slotInfo.first}
                          </div>
                          <div style={{ fontWeight: 'bold' }}>
                            <span style={{ fontSize: '6.5pt', color: '#000' }}>後:</span>{slotInfo.second}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '10pt', fontWeight: 'bold' }}>
                          {slotInfo.first}
                        </div>
                      )
                    ) : null}
                  </td>
                  {/* 守備位置 */}
                  <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold',
                    fontSize: '10pt', height: '15mm', padding: '0.2mm' }}>
                    <span style={{ display: 'block' }}>
                      {slotInfo?.position ?? ''}
                    </span>
                    {slotInfo?.secondPosition && (
                      <span style={{ fontSize: '7pt', fontWeight: 'normal', color: '#000' }}>
                        →{slotInfo.secondPosition}
                      </span>
                    )}
                  </td>

                  {/* イニングセル（一巡目/二巡目 2段 ＋ 各段に打点欄）
                      外枠 = イニンググリッド全体をOCRマーカーとして使用 */}
                  {inningNums.map(n => (
                    <td key={n} style={{
                      ...cell, padding: 0,
                      borderLeft:   n === 1       ? frameB : border,
                      borderRight:  n === innings ? frameB : border,
                      borderBottom: isLast        ? frameB : border,
                    }}>
                      <div className="inn-cell">
                        {/* 一巡目 */}
                        <div className="inn-ab">
                          <div className="inn-code" />
                          <div className="inn-rbi"><span className="inn-rbi-label">点</span></div>
                        </div>
                        {/* 二巡目 */}
                        <div className="inn-ab">
                          <div className="inn-code" />
                          <div className="inn-rbi"><span className="inn-rbi-label">点</span></div>
                        </div>
                      </div>
                    </td>
                  ))}

                  {/* 成績列 */}
                  {STAT_COLS.map(c => (
                    <td key={c} style={{ ...cell, background: '#f0f0f0', height: '15mm' }} />
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* ③ 投手成績 ＋ QRコード（横並び） */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '3mm' }}>

          {/* 投手成績テーブル（左側・伸縮） */}
          <table style={{ borderCollapse: 'collapse', flex: 1, minWidth: 0, fontFamily: font, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '26%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '18%' }} />
            </colgroup>
            <thead>
              <tr>
                <th colSpan={8} style={{ ...hdr, textAlign: 'left', paddingLeft: '1.5mm', fontSize: '8pt' }}>
                  投手成績
                </th>
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
                    <td key={ci} style={{ ...cell, height: '5mm', background: 'white' }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* QRコード（右側・固定幅） */}
          {qrUrl && (
            <div style={{
              flexShrink: 0, width: '22mm',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '0.5mm', paddingTop: '0.5mm',
            }}>
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

        {/* ④ フッター: 外角BL/BR のみ */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1mm' }}>
          <OuterMark />
          <div style={{ flex: 1 }} />
          <OuterMark />
        </div>

      </div>
    </>
  )
}
