import Link from 'next/link'
import { PrintButton } from '@/components/PrintButton'

const font = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif'
const border = '1pt solid #333'
const hdrBg  = '#c8c8c8'

const cell: React.CSSProperties = {
  border, padding: '0.3mm 1mm', fontFamily: font, fontSize: '7pt',
  verticalAlign: 'middle', color: '#000',
}
const hdr: React.CSSProperties = {
  border, padding: '0.3mm 0.5mm', fontFamily: font, fontSize: '7pt',
  background: hdrBg, fontWeight: 'bold', textAlign: 'center', color: '#000',
}
const sectionTitle: React.CSSProperties = {
  fontFamily: font, fontSize: '8.5pt', fontWeight: 'bold', color: '#000',
  borderBottom: '1.5pt solid #000', paddingBottom: '0.3mm', marginBottom: '1mm', marginTop: '2.5mm',
}

const ON_COLOR   = '#e8f5e9'
const OUT_COLOR  = '#fff5f5'
const SACR_COLOR = '#fffde7'

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
    { ab1: '1s' },
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
  const c = code[0]
  if (c === 'O') return OUT_COLOR
  if (['1','2','3','4','B','D'].includes(c)) return ON_COLOR
  if (c === 'S' || c === 'X') return SACR_COLOR
  return 'white'
}

const RBI_W = '5.5mm'

export default function ScoreBookExamplePage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { size: A4 portrait; margin: 8mm; }
          body { visibility: hidden !important; background: white !important;
                 margin: 0 !important; padding: 0 !important; }
          .sheet { visibility: visible !important; position: absolute !important;
                   top: 0 !important; left: 0 !important; width: 100% !important;
                   box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
          .sheet * { visibility: visible !important; }
          .no-print { display: none !important; }
        }
        @media screen {
          body { background: #8a9ab0 !important; }
          .sheet {
            width: 210mm; min-height: 297mm;
            margin: 0 auto; padding: 5mm;
            background: white;
            box-shadow: 0 4px 20px rgba(0,0,0,0.35);
            box-sizing: border-box;
          }
        }
      `}} />

      {/* Controls */}
      <div className="no-print" style={{
        width: '210mm', margin: '0 auto', marginTop: '4rem', padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
        background: '#1e293b', borderBottom: '1px solid #334155',
      }}>
        <Link href="/admin/scorebook-sheet" style={{ color: '#94a3b8', fontSize: '13px', textDecoration: 'none' }}>← 記入シート</Link>
        <span style={{ color: '#e2e8f0', fontWeight: 'bold', fontSize: '14px' }}>スコア記入例・解説</span>
        <PrintButton />
      </div>

      <div className="sheet">

        {/* タイトル */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4mm', marginBottom: '2mm', borderBottom: '2pt solid #000', paddingBottom: '1mm' }}>
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
            <div style={sectionTitle}>① 打席コード一覧</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font }}>
              <thead>
                <tr>
                  <th style={{ ...hdr, width: '14%' }}>コード</th>
                  <th style={{ ...hdr, width: '26%' }}>意味</th>
                  <th style={{ ...hdr }}>説明</th>
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
                    <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', background: '#f5f5f5', fontSize: '9pt', fontFamily: 'monospace' }}>{code}</td>
                    <td style={{ ...cell, fontWeight: 'bold', fontSize: '7pt' }}>{name}</td>
                    <td style={{ ...cell, fontSize: '6.5pt', color: '#333' }}>{desc}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', background: '#e8f0fe', fontSize: '9pt', fontFamily: 'monospace' }}>s</td>
                  <td style={{ ...cell, fontWeight: 'bold', fontSize: '7pt', background: '#e8f0fe' }}>盗塁（添え字）</td>
                  <td style={{ ...cell, fontSize: '6.5pt', color: '#333', background: '#e8f0fe' }}>
                    コードの後ろに付ける。例: <b style={{ fontFamily: 'monospace' }}>1s</b>=単打+盗塁、<b style={{ fontFamily: 'monospace' }}>Bs</b>=四球後に盗塁
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ② 打席欄の書き方 */}
            <div style={sectionTitle}>② 打席欄の書き方</div>

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
              <div>・<b>盗塁</b>：コードの後ろに <b style={{ fontFamily: 'monospace' }}>s</b> を付ける（例: <b style={{ fontFamily: 'monospace' }}>1s</b>=単打+盗塁、<b style={{ fontFamily: 'monospace' }}>Bs</b>=四球後に盗塁）</div>
            </div>

            {/* ③ 成績欄の集計 */}
            <div style={sectionTitle}>③ 成績欄（右端）の集計方法</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font }}>
              <thead>
                <tr>
                  <th style={{ ...hdr, width: '8%' }}>欄</th>
                  <th style={{ ...hdr, width: '18%' }}>内容</th>
                  <th style={hdr}>数え方</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['打', '打数', 'O, 1, 2, 3, 4 の数。四球B・死球D・犠打S・犠飛X は除く'],
                  ['安', '安打数', '1（単打）, 2（二塁打）, 3（三塁打）, 4（本塁打）の数'],
                  ['点', '打点', '打点欄（右半分）に書いた数字の合計'],
                  ['盗', '盗塁', '盗塁に成功した回数（コードに s を付けた打席を数える）'],
                  ['四', '四死球', '四球B と 死球D の合計数'],
                ].map(([col, name, desc]) => (
                  <tr key={col}>
                    <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', background: '#f5f5f5', fontSize: '9pt', fontFamily: 'monospace' }}>{col}</td>
                    <td style={{ ...cell, fontWeight: 'bold', fontSize: '7pt' }}>{name}</td>
                    <td style={{ ...cell, fontSize: '6.5pt', color: '#333' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── 右カラム ── */}
          <div>

            {/* ④ 記入例テーブル（ビジュアルセル） */}
            <div style={sectionTitle}>④ 記入例（3名・7イニング）</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '5%' }} />
                <col style={{ width: '12%' }} />
                {[1,2,3,4,5,6,7].map(n => <col key={n} style={{ width: `${83/7}%` }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...hdr, fontSize: '6.5pt' }}>#</th>
                  <th style={{ ...hdr, fontSize: '6.5pt' }}>名前</th>
                  {[1,2,3,4,5,6,7].map(n => <th key={n} style={{ ...hdr, fontSize: '6.5pt' }}>{n}回</th>)}
                </tr>
              </thead>
              <tbody>
                {players.map(({ order, name, inn }) => (
                  <tr key={order}>
                    <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', background: '#ececec', fontSize: '7pt', padding: 0, verticalAlign: 'middle', paddingLeft: '0.5mm' }}>{order}</td>
                    <td style={{ ...cell, fontWeight: 'bold', fontSize: '7pt', padding: '0 0.5mm' }}>{name}</td>
                    {inn.map((c, i) => (
                      <td key={i} style={{ ...cell, padding: 0 }}>
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

            <div style={{ fontFamily: font, fontSize: '6pt', color: '#555', marginTop: '0.5mm', marginBottom: '1.5mm', display: 'flex', gap: '3mm' }}>
              <span style={{ background: ON_COLOR, padding: '0 1mm', border: '0.5pt solid #aaa' }}>緑=出塁</span>
              <span style={{ background: SACR_COLOR, padding: '0 1mm', border: '0.5pt solid #aaa' }}>黄=犠打飛</span>
              <span style={{ background: OUT_COLOR, padding: '0 1mm', border: '0.5pt solid #aaa' }}>赤=アウト</span>
              <span style={{ color: '#c00', fontWeight: 'bold' }}>赤数字=打点</span>
            </div>

            {/* ⑤ 記入例の解説 */}
            <div style={sectionTitle}>⑤ 記入例の解説</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font }}>
              <thead>
                <tr>
                  <th style={{ ...hdr, width: '20%' }}>選手・回</th>
                  <th style={{ ...hdr, width: '22%' }}>書いた内容</th>
                  <th style={hdr}>意味</th>
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
                  ['やまだ 3回', '上段: 1s', '単打+盗塁（コードの後ろに s を付ける）。成績欄「盗」に1を加算'],
                ].map(([who, written, meaning]) => (
                  <tr key={who}>
                    <td style={{ ...cell, fontSize: '6pt', fontWeight: 'bold' }}>{who}</td>
                    <td style={{ ...cell, fontSize: '6pt', fontFamily: 'monospace' }}>{written}</td>
                    <td style={{ ...cell, fontSize: '6pt' }}>{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
