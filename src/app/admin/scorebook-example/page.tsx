import Link from 'next/link'
import { PrintButton } from '@/components/PrintButton'

const font = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif'
const border = '1pt solid #333'
const hdrBg  = '#c8c8c8'

const cell: React.CSSProperties = {
  border, padding: '0.5mm 1.5mm', fontFamily: font, fontSize: '7.5pt',
  verticalAlign: 'middle', color: '#000',
}
const hdr: React.CSSProperties = {
  border, padding: '0.5mm 1mm', fontFamily: font, fontSize: '7.5pt',
  background: hdrBg, fontWeight: 'bold', textAlign: 'center', color: '#000',
}
const sectionTitle: React.CSSProperties = {
  fontFamily: font, fontSize: '9pt', fontWeight: 'bold', color: '#000',
  borderBottom: '1.5pt solid #000', paddingBottom: '0.5mm', marginBottom: '1.5mm', marginTop: '3mm',
}
const codeBox: React.CSSProperties = {
  display: 'inline-block', background: '#f0f0f0', border: '0.8pt solid #666',
  borderRadius: '1mm', padding: '0 1.5mm', fontWeight: 'bold', fontSize: '9pt',
  fontFamily: 'monospace', color: '#000', minWidth: '6mm', textAlign: 'center',
}

// 記入例データ（正しいコード体系で）
const EXAMPLES = [
  { order: 1, name: 'たなか', inn: ['1', 'O', '12', 'B', '2', 'O', '4'] },
  { order: 2, name: 'やまだ', inn: ['B', 'O', '1s', 'O', 'X', 'O', 'S'] },
  { order: 3, name: 'すずき', inn: ['4', 'O', 'B', '1,O', 'O', 'D', '3'] },
]

const OUT_COLOR   = '#fff5f5'
const ON_COLOR    = '#e8f5e9'
const SACR_COLOR  = '#fffde7'

function cellBg(code: string) {
  const c = code.trim().toUpperCase().split(',')[0][0]
  if ('1234'.includes(c) || c === 'B' || c === 'D') return ON_COLOR
  if (c === 'S' || c === 'X') return SACR_COLOR
  return OUT_COLOR
}

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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4mm', marginBottom: '3mm', borderBottom: '2pt solid #000', paddingBottom: '1.5mm' }}>
          <span style={{ fontFamily: font, fontSize: '13pt', fontWeight: 'bold', color: '#000' }}>
            BLITZ スコア記入ガイド
          </span>
          <span style={{ fontFamily: font, fontSize: '8pt', color: '#555' }}>
            ― 打席欄の書き方・コード一覧・記入例
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5mm' }}>

          {/* ── 左カラム ── */}
          <div>

            {/* ① コード一覧 */}
            <div style={sectionTitle}>① 打席コード一覧</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font, marginBottom: '1mm' }}>
              <thead>
                <tr>
                  <th style={{ ...hdr, width: '14%' }}>コード</th>
                  <th style={{ ...hdr, width: '28%' }}>意味</th>
                  <th style={{ ...hdr }}>説明</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['O', 'アウト', '三振・ゴロ・フライなど、アウトは全部 O（ゼロではなくアルファベット）'],
                  ['1', '単打（安打）', 'シングルヒット'],
                  ['2', '二塁打', 'ツーベース'],
                  ['3', '三塁打', 'スリーベース'],
                  ['4', '本塁打', 'ホームラン。自動的に打点1がつく'],
                  ['B', '四球', 'フォアボール。打数にカウントされない'],
                  ['D', '死球', 'デッドボール。打数にカウントされない'],
                  ['S', '犠打', 'バント犠打。打数にカウントされない'],
                  ['X', '犠飛', 'サクリファイスフライ。打数にカウントされない'],
                ].map(([code, name, desc]) => (
                  <tr key={code}>
                    <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', background: '#f5f5f5', fontSize: '10pt', fontFamily: 'monospace' }}>{code}</td>
                    <td style={{ ...cell, fontWeight: 'bold' }}>{name}</td>
                    <td style={{ ...cell, fontSize: '7pt', color: '#333' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ② サフィックス */}
            <div style={sectionTitle}>② サフィックス（コードの後ろに付ける）</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font, marginBottom: '1mm' }}>
              <thead>
                <tr>
                  <th style={{ ...hdr, width: '20%' }}>付け方</th>
                  <th style={{ ...hdr, width: '28%' }}>意味</th>
                  <th style={{ ...hdr }}>例</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['数字 (1〜9)', '打点数', ['12 → 単打・2打点', '42 → 2ランホームラン', '43 → 3ランホームラン', '44 → 満塁ホームラン']],
                  ['s または S', '盗塁', ['1s → 単打+盗塁', '12s → 単打・2打点・盗塁', 'Bs → 四球後に盗塁']],
                ].map(([suf, meaning, examples]) => (
                  <tr key={String(suf)}>
                    <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', background: '#f5f5f5', fontSize: '9pt', fontFamily: 'monospace' }}>{suf}</td>
                    <td style={{ ...cell, fontWeight: 'bold' }}>{meaning}</td>
                    <td style={{ ...cell, fontSize: '7pt' }}>
                      {(examples as string[]).map((ex, i) => (
                        <div key={i}>{ex}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ③ 同イニング複数打席 */}
            <div style={sectionTitle}>③ 同じイニングに2打席以上の場合</div>
            <div style={{ fontFamily: font, fontSize: '7.5pt', color: '#222', lineHeight: 1.8, marginBottom: '2mm' }}>
              <div>カンマ（,）で区切って1つのマスに書きます。</div>
              <div style={{ display: 'flex', gap: '6mm', flexWrap: 'wrap', marginTop: '1mm' }}>
                {[
                  ['1,O', '1打席目:安打 → 2打席目:アウト'],
                  ['O,1', '1打席目:アウト → 2打席目:安打'],
                  ['B,12', '1打席目:四球 → 2打席目:単打・2打点'],
                ].map(([code, desc]) => (
                  <div key={code} style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
                    <span style={codeBox}>{code}</span>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ④ 打席欄の構造 */}
            <div style={sectionTitle}>④ 打席欄の構造</div>
            <div style={{ display: 'flex', gap: '4mm', alignItems: 'flex-start' }}>
              {/* 模式図 */}
              <div style={{ flexShrink: 0 }}>
                <div style={{ border: '1.5pt solid #333', display: 'flex', flexDirection: 'column', width: '28mm', height: '20mm', fontSize: '6.5pt', fontFamily: font }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', borderBottom: '0.8pt dashed #999' }}>
                    <div style={{ flex: 1, padding: '0.5mm 1mm', color: '#555', display: 'flex', alignItems: 'center' }}>
                      1巡目のコード
                    </div>
                    <div style={{ width: '7mm', borderLeft: '0.5pt solid #ccc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '0.3mm' }}>
                      <span style={{ fontSize: '5pt', color: '#999' }}>打点</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'stretch' }}>
                    <div style={{ flex: 1, padding: '0.5mm 1mm', color: '#555', display: 'flex', alignItems: 'center' }}>
                      2巡目のコード
                    </div>
                    <div style={{ width: '7mm', borderLeft: '0.5pt solid #ccc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '0.3mm' }}>
                      <span style={{ fontSize: '5pt', color: '#999' }}>打点</span>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ fontFamily: font, fontSize: '7pt', lineHeight: 1.9, color: '#222' }}>
                <div>・上段 = 1巡目の打席</div>
                <div>・下段 = 2巡目の打席</div>
                <div>・右の小欄 = 打点を数字で記入</div>
                <div>・コードに打点サフィックスを使う場合は小欄は不要</div>
              </div>
            </div>
          </div>

          {/* ── 右カラム ── */}
          <div>

            {/* ⑤ 具体的な記入例 */}
            <div style={sectionTitle}>⑤ 記入例（3名・7イニング）</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font, tableLayout: 'fixed', marginBottom: '2mm' }}>
              <colgroup>
                <col style={{ width: '5%' }} />
                <col style={{ width: '13%' }} />
                {Array.from({ length: 7 }, (_, i) => <col key={i} style={{ width: `${82/7}%` }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...hdr }}>#</th>
                  <th style={{ ...hdr }}>名前</th>
                  {[1,2,3,4,5,6,7].map(n => <th key={n} style={{ ...hdr }}>{n}回</th>)}
                </tr>
              </thead>
              <tbody>
                {EXAMPLES.map(({ order, name, inn }) => (
                  <tr key={order}>
                    <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', background: '#ececec' }}>{order}</td>
                    <td style={{ ...cell, fontWeight: 'bold' }}>{name}</td>
                    {inn.map((code, i) => (
                      <td key={i} style={{ ...cell, textAlign: 'center', fontSize: '8pt',
                        fontFamily: 'monospace', fontWeight: 'bold',
                        background: cellBg(code) }}>
                        {code}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontFamily: font, fontSize: '6.5pt', color: '#555', marginBottom: '3mm', lineHeight: 1.7 }}>
              <span style={{ background: ON_COLOR, padding: '0 1.5mm', border: '0.5pt solid #aaa' }}>緑</span> 出塁（安打・四球・死球）
              <span style={{ background: SACR_COLOR, padding: '0 1.5mm', border: '0.5pt solid #aaa' }}>黄</span> 犠打・犠飛
              <span style={{ background: OUT_COLOR, padding: '0 1.5mm', border: '0.5pt solid #aaa' }}>赤</span> アウト
            </div>

            {/* ⑥ 例の詳細説明 */}
            <div style={sectionTitle}>⑥ 上記の記入例の解説</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font, marginBottom: '2mm' }}>
              <thead>
                <tr>
                  <th style={{ ...hdr, width: '16%' }}>コード</th>
                  <th style={{ ...hdr }}>意味</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['12', '単打・2打点（例：2点タイムリーヒット）'],
                  ['1s', '単打・盗塁（ヒット後に盗塁成功）'],
                  ['X', '犠飛（フライで1点入る）'],
                  ['4', '本塁打・打点1（ソロホームラン）'],
                  ['42', '本塁打・打点2（2ランホームラン）'],
                  ['1,O', '同じイニングに2打席：1打席目=安打 → 2打席目=アウト'],
                  ['D', '死球（デッドボール）で出塁'],
                  ['S', '犠打（バント）。打数にカウントされない'],
                  ['B', '四球（フォアボール）。打数にカウントされない'],
                  ['O', 'アウト（三振・ゴロ・フライ問わず全部 O）'],
                ].map(([code, desc]) => (
                  <tr key={code}>
                    <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', background: '#f5f5f5', fontSize: '9pt', fontFamily: 'monospace' }}>{code}</td>
                    <td style={{ ...cell, fontSize: '7.5pt' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ⑦ 成績欄の集計 */}
            <div style={sectionTitle}>⑦ 右側「成績欄」の集計方法</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: font }}>
              <thead>
                <tr>
                  <th style={{ ...hdr, width: '8%' }}>欄</th>
                  <th style={{ ...hdr, width: '22%' }}>集計内容</th>
                  <th style={{ ...hdr }}>カウントするコード</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['打', '打数', 'O, K, G, F, 1, 2, 3, 4（四球B・死球D・犠打S・犠飛X は除く）'],
                  ['安', '安打数', '1（単打）, 2（二塁打）, 3（三塁打）, 4（本塁打）'],
                  ['点', '打点', 'コードの数字サフィックス（4は自動的に1打点）'],
                  ['盗', '盗塁', 'S サフィックスの数（1s, Bs など）'],
                  ['四', '四死球', 'B（四球）+ D（死球）'],
                ].map(([col, name, desc]) => (
                  <tr key={col}>
                    <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold', background: '#f5f5f5', fontSize: '10pt', fontFamily: 'monospace' }}>{col}</td>
                    <td style={{ ...cell, fontWeight: 'bold' }}>{name}</td>
                    <td style={{ ...cell, fontSize: '7pt', color: '#333' }}>{desc}</td>
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
