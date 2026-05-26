import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? 'file:./dev.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])

// スコアパース: 勝ち=最大値がours、負け=最小値がours、引分=左がours
function parseScore(score: string, result: 'WIN' | 'LOSE' | 'DRAW') {
  const nums = score.replace('x', '').split('-').map(Number)
  const [a, b] = [nums[0], nums[1]]
  if (result === 'WIN')  return { ourScore: Math.max(a, b), opponentScore: Math.min(a, b) }
  if (result === 'LOSE') return { ourScore: Math.min(a, b), opponentScore: Math.max(a, b) }
  return { ourScore: a, opponentScore: b } // DRAW
}

// 同日複数試合に時刻オフセット付与
const dateCounts: Record<string, number> = {}
function gameDate(dateStr: string, order?: number): Date {
  const key = dateStr
  dateCounts[key] = (dateCounts[key] ?? 0) + 1
  const idx = order ?? dateCounts[key] - 1
  const d = new Date(dateStr + 'T10:00:00')
  d.setHours(10 + idx * 3)
  return d
}

const R = 'REGULAR'  as const
const P = 'PRACTICE' as const

// 全229試合 (teams.one から移植)
const games: {
  date: string; opponent: string; score: string;
  win: 'WIN'|'LOSE'|'DRAW'; type: typeof R | typeof P
}[] = [
  // 2026
  { date:'2026-05-17', opponent:'佐土',           score:'6-4',   win:'LOSE', type:R },
  { date:'2026-05-17', opponent:'伊保マトリーズ', score:'4-7',   win:'LOSE', type:R },
  { date:'2026-04-27', opponent:'貴崎',           score:'2-11',  win:'LOSE', type:R },
  { date:'2026-04-26', opponent:'貴崎',           score:'5-4',   win:'LOSE', type:R },
  { date:'2026-04-12', opponent:'伊保マトリーズ', score:'3-11',  win:'LOSE', type:R },
  { date:'2026-04-12', opponent:'佐土',           score:'6-9',   win:'WIN',  type:R },
  { date:'2026-03-22', opponent:'貴崎',           score:'4-5',   win:'LOSE', type:R },
  { date:'2026-03-22', opponent:'貴崎',           score:'9-9',   win:'DRAW', type:R },
  { date:'2026-03-08', opponent:'オーガニック',   score:'18-2',  win:'WIN',  type:R },
  { date:'2026-03-08', opponent:'佐土',           score:'15-3',  win:'LOSE', type:R },
  { date:'2026-02-22', opponent:'フェローズ',     score:'8-8',   win:'DRAW', type:R },
  { date:'2026-02-22', opponent:'播州塁球',       score:'1-21',  win:'WIN',  type:R },
  // 2025
  { date:'2025-09-28', opponent:'西脇',           score:'9-7',   win:'WIN',  type:R },
  { date:'2025-09-28', opponent:'中別府',         score:'5-6',   win:'LOSE', type:R },
  { date:'2025-09-14', opponent:'新野辺',         score:'3-12',  win:'LOSE', type:R },
  { date:'2025-09-14', opponent:'別府',           score:'4-9',   win:'LOSE', type:R },
  { date:'2025-06-29', opponent:'新野辺',         score:'8-9',   win:'LOSE', type:R },
  { date:'2025-06-29', opponent:'別府',           score:'13-7',  win:'WIN',  type:R },
  { date:'2025-06-22', opponent:'オーガニック',   score:'4-9',   win:'WIN',  type:R },
  { date:'2025-06-01', opponent:'新野辺',         score:'7-2',   win:'LOSE', type:R },
  { date:'2025-06-01', opponent:'別府',           score:'17-9',  win:'LOSE', type:R },
  { date:'2025-05-18', opponent:'オーガニック',   score:'11-5',  win:'WIN',  type:R },
  { date:'2025-05-11', opponent:'暁',             score:'13-8',  win:'LOSE', type:R },
  { date:'2025-05-11', opponent:'SSC',            score:'0-12',  win:'WIN',  type:R },
  { date:'2025-04-27', opponent:'西脇',           score:'6-6',   win:'DRAW', type:R },
  { date:'2025-04-27', opponent:'中別府',         score:'6-5',   win:'WIN',  type:R },
  { date:'2025-02-16', opponent:'佐土',           score:'3-3',   win:'DRAW', type:P },
  { date:'2025-02-16', opponent:'オーガニック',   score:'9-3',   win:'WIN',  type:P },
  // 2024
  { date:'2024-11-24', opponent:'暁',             score:'5-6',   win:'LOSE', type:R },
  { date:'2024-11-24', opponent:'佐土',           score:'8-9',   win:'WIN',  type:R },
  { date:'2024-10-27', opponent:'丸徳',           score:'26-1',  win:'LOSE', type:R },
  { date:'2024-10-27', opponent:'ビクトリー',     score:'3-13',  win:'LOSE', type:R },
  { date:'2024-09-29', opponent:'ラッピーズ',     score:'14-1',  win:'LOSE', type:R },
  { date:'2024-09-29', opponent:'佐土',           score:'8-9',   win:'LOSE', type:R },
  { date:'2024-09-01', opponent:'K&K',            score:'7-5',   win:'WIN',  type:P },
  { date:'2024-09-01', opponent:'佐土',           score:'3-2',   win:'LOSE', type:P },
  { date:'2024-07-28', opponent:'ビクトリー',     score:'22-0',  win:'LOSE', type:R },
  { date:'2024-07-28', opponent:'丸徳',           score:'1-19',  win:'LOSE', type:R },
  { date:'2024-05-19', opponent:'暁',             score:'19-1',  win:'LOSE', type:R },
  { date:'2024-05-19', opponent:'ラッピーズ',     score:'2-6',   win:'LOSE', type:R },
  // 2023
  { date:'2023-11-12', opponent:'スタンダード',   score:'9-13',  win:'LOSE', type:R },
  { date:'2023-11-12', opponent:'時光寺ファイターズ', score:'0-7', win:'LOSE', type:R },
  { date:'2023-10-22', opponent:'暁',             score:'0-9',   win:'LOSE', type:R },
  { date:'2023-10-22', opponent:'ラッピーズ',     score:'16-1',  win:'LOSE', type:R },
  { date:'2023-09-24', opponent:'ビクトリー',     score:'12-7',  win:'LOSE', type:R },
  { date:'2023-09-24', opponent:'佐土',           score:'11-12', win:'LOSE', type:R },
  { date:'2023-08-27', opponent:'佐土',           score:'6-8',   win:'LOSE', type:P },
  { date:'2023-08-27', opponent:'飛翔会',         score:'5-5',   win:'DRAW', type:P },
  { date:'2023-07-23', opponent:'ナイスリターズ', score:'1-7',   win:'LOSE', type:P },
  { date:'2023-07-23', opponent:'佐土',           score:'3-10',  win:'LOSE', type:P },
  { date:'2023-06-25', opponent:'丸徳',           score:'11-2',  win:'LOSE', type:R },
  { date:'2023-06-25', opponent:'ラッピーズ',     score:'4-6',   win:'LOSE', type:R },
  { date:'2023-05-28', opponent:'佐土',           score:'9-2',   win:'LOSE', type:R },
  { date:'2023-05-28', opponent:'ビクトリー',     score:'3-6',   win:'LOSE', type:R },
  { date:'2023-04-23', opponent:'暁',             score:'9-0',   win:'LOSE', type:R },
  { date:'2023-04-23', opponent:'丸徳',           score:'0-10',  win:'LOSE', type:R },
  { date:'2023-04-09', opponent:'スタンダード',   score:'2-12',  win:'WIN',  type:R },
  { date:'2023-04-09', opponent:'暁',             score:'6-10',  win:'LOSE', type:R },
  // 2022
  { date:'2022-11-20', opponent:'ナイスリターンズ', score:'12-3', win:'LOSE', type:P },
  { date:'2022-11-20', opponent:'リンクス',       score:'3-16',  win:'LOSE', type:P },
  { date:'2022-10-23', opponent:'暁',             score:'13-7',  win:'LOSE', type:R },
  { date:'2022-10-23', opponent:'ビクトリー',     score:'6-12',  win:'LOSE', type:R },
  { date:'2022-10-02', opponent:'Flying Rockets', score:'11-18', win:'WIN',  type:P },
  { date:'2022-10-02', opponent:'Flying Rockets', score:'2-8',   win:'LOSE', type:P },
  { date:'2022-07-24', opponent:'ラッピーズ',     score:'2-23',  win:'LOSE', type:R },
  { date:'2022-07-24', opponent:'佐土',           score:'13-9',  win:'LOSE', type:R },
  { date:'2022-07-10', opponent:'フーミンズ',     score:'10-10', win:'DRAW', type:P },
  { date:'2022-07-10', opponent:'WILD CATS',      score:'4-10',  win:'LOSE', type:P },
  { date:'2022-06-26', opponent:'暁',             score:'3-6',   win:'LOSE', type:R },
  { date:'2022-06-26', opponent:'丸徳',           score:'13-3',  win:'LOSE', type:R },
  { date:'2022-05-22', opponent:'佐土',           score:'8-9',   win:'LOSE', type:R },
  { date:'2022-05-22', opponent:'ラッピーズ',     score:'16-2',  win:'LOSE', type:R },
  { date:'2022-04-17', opponent:'ビクトリー',     score:'11-1',  win:'LOSE', type:R },
  { date:'2022-04-17', opponent:'丸徳',           score:'3-5',   win:'LOSE', type:R },
  { date:'2022-04-10', opponent:'時光寺ファイターズ', score:'9-1', win:'LOSE', type:R },
  { date:'2022-04-10', opponent:'伊保マトリーズ', score:'7-9',   win:'LOSE', type:R },
  // 2021
  { date:'2021-11-21', opponent:'佐土',           score:'8-1',   win:'WIN',  type:R },
  { date:'2021-11-21', opponent:'スーパーカルビース', score:'5-4', win:'LOSE', type:R },
  { date:'2021-11-14', opponent:'シンノス',       score:'7-9',   win:'LOSE', type:R },
  { date:'2021-11-14', opponent:'シュリツ',       score:'4-16',  win:'LOSE', type:R },
  { date:'2021-11-14', opponent:'伊保マトリーズ', score:'4-6',   win:'WIN',  type:R },
  { date:'2021-10-24', opponent:'佐土',           score:'8-7',   win:'LOSE', type:R },
  { date:'2021-10-24', opponent:'スーパーカルビース', score:'1-10', win:'LOSE', type:R },
  { date:'2021-10-03', opponent:'くらっしゃー',   score:'8-9',   win:'WIN',  type:P },
  { date:'2021-10-03', opponent:'ナイスリターンズ', score:'13-9', win:'WIN',  type:P },
  { date:'2021-08-01', opponent:'太田工業',       score:'5-12',  win:'LOSE', type:R },
  { date:'2021-08-01', opponent:'暁',             score:'1-20',  win:'LOSE', type:R },
  { date:'2021-08-01', opponent:'伊保マトリーズ', score:'11-2',  win:'WIN',  type:R },
  { date:'2021-07-25', opponent:'ゴールドチキン', score:'6-12',  win:'WIN',  type:P },
  { date:'2021-07-25', opponent:'アリオン',       score:'5-9',   win:'LOSE', type:P },
  { date:'2021-07-18', opponent:'丸徳',           score:'14-15', win:'WIN',  type:R },
  { date:'2021-07-18', opponent:'ラッピーズ',     score:'9-4',   win:'WIN',  type:R },
  { date:'2021-06-27', opponent:'ビクトリー',     score:'14-0',  win:'LOSE', type:R },
  { date:'2021-06-27', opponent:'丸徳',           score:'4-5',   win:'LOSE', type:R },
  { date:'2021-04-18', opponent:'ビクトリー',     score:'1-15',  win:'LOSE', type:R },
  { date:'2021-04-18', opponent:'ラッピーズ',     score:'17-4',  win:'LOSE', type:R },
  { date:'2021-04-11', opponent:'暁',             score:'3-11',  win:'LOSE', type:R },
  { date:'2021-04-11', opponent:'時光寺ファイターズ', score:'3-4', win:'LOSE', type:R },
  { date:'2021-02-14', opponent:'WILD CATS',      score:'18-8',  win:'LOSE', type:P },
  { date:'2021-02-14', opponent:'WILD CATS',      score:'12-13', win:'LOSE', type:P },
  { date:'2021-01-17', opponent:'ゴールドチキン', score:'5-10',  win:'WIN',  type:P },
  { date:'2021-01-17', opponent:'フーミンズ',     score:'20-8',  win:'WIN',  type:P },
  // 2020
  { date:'2020-11-15', opponent:'笠形レンジャーズ', score:'19-7', win:'LOSE', type:R },
  { date:'2020-11-15', opponent:'時光寺ファイターズ', score:'14-3', win:'LOSE', type:R },
  { date:'2020-11-01', opponent:'イーグルス',     score:'6-7',   win:'LOSE', type:P },
  { date:'2020-11-01', opponent:'ナイスリターンズ', score:'12-1', win:'WIN',  type:P },
  { date:'2020-10-25', opponent:'ビクトリー',     score:'1-8',   win:'LOSE', type:R },
  { date:'2020-10-25', opponent:'ラッピーズ',     score:'11-3',  win:'LOSE', type:R },
  { date:'2020-10-11', opponent:'高丘二丁目',     score:'7-4',   win:'WIN',  type:P },
  { date:'2020-10-11', opponent:'アリオン',       score:'11-4',  win:'WIN',  type:P },
  { date:'2020-09-27', opponent:'佐土',           score:'5-1',   win:'WIN',  type:R },
  { date:'2020-09-27', opponent:'丸徳',           score:'6-2',   win:'LOSE', type:R },
  { date:'2020-09-20', opponent:'sin nosu',       score:'2-11',  win:'LOSE', type:R },
  { date:'2020-09-20', opponent:'伊保マリナーズ', score:'6-5',   win:'LOSE', type:R },
  { date:'2020-08-23', opponent:'佐土',           score:'13-13', win:'DRAW', type:R },
  { date:'2020-08-23', opponent:'スーパーカルビーズ', score:'10-17', win:'LOSE', type:R },
  { date:'2020-08-02', opponent:'アリオン',       score:'10-7',  win:'WIN',  type:R },
  { date:'2020-08-02', opponent:'暁',             score:'6-7',   win:'LOSE', type:R },
  { date:'2020-08-02', opponent:'伊保マトリーズ', score:'4-13',  win:'WIN',  type:R },
  { date:'2020-07-19', opponent:'カサガタレンジャーズ', score:'7-6', win:'WIN', type:P },
  { date:'2020-07-19', opponent:'アリオン',       score:'12-12', win:'DRAW', type:P },
  { date:'2020-07-19', opponent:'ビクトリー',     score:'8-1',   win:'LOSE', type:R },
  { date:'2020-07-19', opponent:'ラッピーズ',     score:'9-10',  win:'LOSE', type:R },
  { date:'2020-07-05', opponent:'式彩ファイターズ', score:'8-2',  win:'LOSE', type:R },
  { date:'2020-07-05', opponent:'時光寺ファイターズ', score:'3-8', win:'LOSE', type:R },
  { date:'2020-06-21', opponent:'丸徳',           score:'1-9',   win:'LOSE', type:R },
  { date:'2020-06-21', opponent:'スーパーカルビース', score:'7-3', win:'LOSE', type:R },
  { date:'2020-03-15', opponent:'白鷺オーシャンズ', score:'11-3', win:'LOSE', type:P },
  { date:'2020-03-15', opponent:'白鷺オーシャンズ', score:'3-7',  win:'LOSE', type:P },
  { date:'2020-03-15', opponent:'SP',             score:'0-7',   win:'LOSE', type:P },
  { date:'2020-03-15', opponent:'ラッピーズ',     score:'8-1',   win:'LOSE', type:P },
  { date:'2020-03-01', opponent:'SP・ラッピーズ連合', score:'5-4', win:'WIN', type:P },
  { date:'2020-03-01', opponent:'太子マスターズ', score:'2-16',  win:'LOSE', type:P },
  { date:'2020-03-01', opponent:'香寺ロッカーズ', score:'2-1',   win:'WIN',  type:P },
  // 2019
  { date:'2019-11-24', opponent:'丸徳',           score:'3-8',   win:'LOSE', type:P },
  { date:'2019-11-24', opponent:'ビクトリー',     score:'3-6',   win:'LOSE', type:P },
  { date:'2019-10-27', opponent:'ビクトリー',     score:'2-9',   win:'LOSE', type:R },
  { date:'2019-10-27', opponent:'佐土',           score:'5-6',   win:'LOSE', type:R },
  { date:'2019-10-20', opponent:'カサガタビレッジ', score:'8-9',  win:'WIN',  type:P },
  { date:'2019-10-20', opponent:'カサガタビレッジ', score:'9-3',  win:'WIN',  type:P },
  { date:'2019-09-29', opponent:'ビクトリー',     score:'7-2',   win:'LOSE', type:R },
  { date:'2019-09-29', opponent:'ルート66',       score:'4-6',   win:'LOSE', type:R },
  { date:'2019-09-08', opponent:'暁クラブ',       score:'5-14',  win:'LOSE', type:P },
  { date:'2019-09-08', opponent:'sin nosu',       score:'7-14',  win:'LOSE', type:P },
  { date:'2019-07-28', opponent:'ビクトリー',     score:'2-9',   win:'LOSE', type:R },
  { date:'2019-07-28', opponent:'ルート66',       score:'1-7',   win:'WIN',  type:R },
  { date:'2019-07-14', opponent:'フラロケ',       score:'3-2',   win:'WIN',  type:P },
  { date:'2019-07-14', opponent:'アリオン',       score:'7-6',   win:'WIN',  type:P },
  { date:'2019-06-23', opponent:'佐土',           score:'10-5',  win:'LOSE', type:R },
  { date:'2019-06-23', opponent:'ラッピーズ',     score:'3-2',   win:'WIN',  type:R },
  { date:'2019-06-09', opponent:'sin nosu',       score:'8-8',   win:'DRAW', type:P },
  { date:'2019-06-09', opponent:'ナイスリターズ', score:'6-12',  win:'LOSE', type:P },
  { date:'2019-05-26', opponent:'丸徳',           score:'5-1',   win:'LOSE', type:R },
  { date:'2019-05-26', opponent:'佐土',           score:'10-0',  win:'WIN',  type:R },
  { date:'2019-05-19', opponent:'ナイスリターズ', score:'17-4',  win:'WIN',  type:P },
  { date:'2019-05-19', opponent:'おくちゃんず',   score:'7-7',   win:'DRAW', type:P },
  { date:'2019-04-21', opponent:'丸徳',           score:'3-4',   win:'LOSE', type:R },
  { date:'2019-04-21', opponent:'ラッピーズ',     score:'21-0',  win:'LOSE', type:R },
  { date:'2019-03-24', opponent:'アリオン',       score:'8-2',   win:'WIN',  type:P },
  { date:'2019-03-24', opponent:'アリオン',       score:'6-11',  win:'WIN',  type:P },
  { date:'2019-03-17', opponent:'ビクトリー',     score:'8-8',   win:'DRAW', type:P },
  { date:'2019-03-17', opponent:'香寺ロッカーズ', score:'0-6',   win:'LOSE', type:P },
  { date:'2019-02-10', opponent:'shin nosu',      score:'12-8',  win:'WIN',  type:P },
  { date:'2019-02-10', opponent:'SP',             score:'3-10',  win:'LOSE', type:P },
  // 2018
  { date:'2018-11-25', opponent:'レッドファンキース', score:'8-14', win:'LOSE', type:P },
  { date:'2018-11-25', opponent:'ビクトリー',     score:'6-0',   win:'WIN',  type:P },
  { date:'2018-11-11', opponent:'アリオン',       score:'7-16',  win:'WIN',  type:P },
  { date:'2018-11-11', opponent:'アリオン',       score:'5-12',  win:'LOSE', type:P },
  { date:'2018-10-28', opponent:'小宮シスターズ', score:'3-8',   win:'WIN',  type:P },
  { date:'2018-10-28', opponent:'ルート66',       score:'9-3',   win:'WIN',  type:P },
  { date:'2018-10-14', opponent:'フラロケ',       score:'9-5',   win:'WIN',  type:P },
  { date:'2018-10-14', opponent:'フラロケ',       score:'5-10',  win:'WIN',  type:P },
  { date:'2018-09-23', opponent:'白鷺オーシャンズ', score:'3-8',  win:'LOSE', type:P },
  { date:'2018-09-23', opponent:'白鷺オーシャンズ', score:'8-9',  win:'LOSE', type:P },
  { date:'2018-09-23', opponent:'白鷺オーシャンズ', score:'6-4',  win:'LOSE', type:P },
  { date:'2018-09-23', opponent:'ビクトリー',     score:'1-5',   win:'LOSE', type:R },
  { date:'2018-09-23', opponent:'ルート66',       score:'3-4',   win:'WIN',  type:R },
  { date:'2018-08-26', opponent:'アリオン',       score:'9-6',   win:'LOSE', type:P },
  { date:'2018-08-26', opponent:'ナイスリターンズ', score:'7-2',  win:'LOSE', type:P },
  { date:'2018-08-26', opponent:'ナイスリターンズ', score:'5-14', win:'WIN',  type:P },
  { date:'2018-08-26', opponent:'アリオン',       score:'1-7',   win:'LOSE', type:P },
  { date:'2018-07-22', opponent:'白鷺オーシャンズ', score:'1-15', win:'LOSE', type:P },
  { date:'2018-07-22', opponent:'白鷺オーシャンズ', score:'8-16', win:'WIN',  type:P },
  { date:'2018-07-22', opponent:'白鷺オーシャンズ', score:'7-8',  win:'LOSE', type:P },
  { date:'2018-07-22', opponent:'ビクトリー',     score:'14-0',  win:'LOSE', type:R },
  { date:'2018-07-22', opponent:'ルート66',       score:'7-5',   win:'WIN',  type:R },
  { date:'2018-06-24', opponent:'アリオン',       score:'8-5',   win:'LOSE', type:P },
  { date:'2018-06-24', opponent:'アリオン',       score:'11-10', win:'WIN',  type:P },
  { date:'2018-06-24', opponent:'佐土',           score:'2-3',   win:'LOSE', type:R },
  { date:'2018-06-24', opponent:'飛翔会',         score:'13-7',  win:'LOSE', type:R },
  { date:'2018-05-27', opponent:'ラッピーズ',     score:'1-12',  win:'WIN',  type:R },
  { date:'2018-05-27', opponent:'飛翔会',         score:'13-3',  win:'WIN',  type:R },
  { date:'2018-04-22', opponent:'ラッピーズ',     score:'4-5',   win:'LOSE', type:R },
  { date:'2018-04-22', opponent:'佐土',           score:'4-0',   win:'LOSE', type:R },
  { date:'2018-04-01', opponent:'フラロケ',       score:'12-1',  win:'WIN',  type:P },
  { date:'2018-04-01', opponent:'フラロケ',       score:'4-8',   win:'WIN',  type:P },
  { date:'2018-04-01', opponent:'アリオン',       score:'7-10',  win:'LOSE', type:P },
  { date:'2018-03-11', opponent:'SP',             score:'1-6',   win:'LOSE', type:P },
  { date:'2018-03-11', opponent:'太子マスターズ', score:'4-1',   win:'LOSE', type:P },
  { date:'2018-03-04', opponent:'白鷺オーシャンズ', score:'14-4', win:'LOSE', type:P },
  { date:'2018-03-04', opponent:'白鷺オーシャンズ', score:'1-11', win:'LOSE', type:P },
  { date:'2018-02-04', opponent:'白鷺オーシャンズ', score:'7-15', win:'WIN',  type:P },
  { date:'2018-02-04', opponent:'白鷺オーシャンズ', score:'6-7',  win:'LOSE', type:P },
  { date:'2018-02-04', opponent:'白鷺オーシャンズ', score:'15-0', win:'LOSE', type:P },
  // 2017
  { date:'2017-11-26', opponent:'飛翔会',         score:'8-8',   win:'DRAW', type:R },
  { date:'2017-11-26', opponent:'ビクトリー',     score:'4-21',  win:'LOSE', type:R },
  { date:'2017-09-24', opponent:'ラッピーズ',     score:'6-5',   win:'WIN',  type:R },
  { date:'2017-09-24', opponent:'佐土',           score:'5-1',   win:'LOSE', type:R },
  { date:'2017-09-10', opponent:'ナイスリターンズ', score:'5-6',  win:'LOSE', type:P },
  { date:'2017-09-10', opponent:'ゴールドチキン', score:'1-18',  win:'LOSE', type:P },
  { date:'2017-08-27', opponent:'白鷺オーシャンズ', score:'3-10', win:'WIN',  type:P },
  { date:'2017-08-27', opponent:'白鷺オーシャンズ', score:'8-8',  win:'DRAW', type:P },
  { date:'2017-08-20', opponent:'おくちゃんず',   score:'9-8',   win:'WIN',  type:P },
  { date:'2017-08-20', opponent:'スレイヤーズ',   score:'2-17',  win:'LOSE', type:P },
  { date:'2017-07-23', opponent:'飛翔会',         score:'5-12',  win:'LOSE', type:R },
  { date:'2017-07-23', opponent:'ルート66',       score:'2-8',   win:'LOSE', type:R },
  { date:'2017-05-28', opponent:'ビクトリー',     score:'6-4',   win:'LOSE', type:R },
  { date:'2017-05-28', opponent:'ルート66',       score:'10-5',  win:'LOSE', type:R },
  { date:'2017-05-14', opponent:'佐土',           score:'4-16',  win:'LOSE', type:P },
  { date:'2017-05-14', opponent:'ALLION',         score:'8-12',  win:'LOSE', type:P },
  { date:'2017-04-23', opponent:'佐土',           score:'7-12',  win:'LOSE', type:R },
  { date:'2017-04-23', opponent:'ラッピーズ',     score:'9-4',   win:'LOSE', type:R },
  { date:'2017-04-02', opponent:'スレイヤーズ',   score:'12-2',  win:'LOSE', type:P },
  { date:'2017-04-02', opponent:'ナイスリターズ', score:'28-1',  win:'LOSE', type:P },
  { date:'2017-03-12', opponent:'鼎',             score:'0-7',   win:'LOSE', type:P },
  { date:'2017-03-12', opponent:'あかつき',       score:'10-6',  win:'WIN',  type:P },
  { date:'2017-03-12', opponent:'北条',           score:'8-6',   win:'WIN',  type:P },
  { date:'2017-02-26', opponent:'神和坂',         score:'9-2',   win:'LOSE', type:P },
  { date:'2017-02-26', opponent:'スレイヤーズ',   score:'3-14',  win:'LOSE', type:P },
]

async function main() {
  console.log('Seeding...')

  await prisma.gameStat.deleteMany()
  await prisma.game.deleteMany()
  await prisma.attendance.deleteMany()
  await prisma.schedule.deleteMany()
  await prisma.user.deleteMany()

  const adminPw  = await bcrypt.hash('admin123',  10)
  const playerPw = await bcrypt.hash('player123', 10)

  // 管理者
  await prisma.user.create({
    data: { name: 'Tanaka', email: 'admin@blitz.jp', password: adminPw, role: 'ADMIN', number: 28, position: '内野手' },
  })

  // 選手（teams.one から移植）
  const playerData = [
    { name: 'SHUNTA',     email: 'shunta@blitz.jp',     number: 1,  position: '外野手' },
    { name: 'つーさん',   email: 'tsurasan@blitz.jp',   number: 2,  position: '捕手' },
    { name: 'けんと',     email: 'kento@blitz.jp',       number: 6,  position: '内野手' },
    { name: 'KENGO',      email: 'kengo@blitz.jp',       number: 7,  position: '外野手' },
    { name: 'えりか',     email: 'erika@blitz.jp',       number: 7,  position: '内野手' },
    { name: 'しんのすけ', email: 'shinnosuke@blitz.jp', number: 8,  position: '内野手' },
    { name: 'ゆか',       email: 'yuka@blitz.jp',        number: 11, position: '投手' },
    { name: 'あやか',     email: 'ayaka@blitz.jp',       number: 12, position: '内野手' },
    { name: 'やすは',     email: 'yasuha@blitz.jp',      number: 14, position: '投手' },
    { name: 'つぼきん',   email: 'tsubokin@blitz.jp',   number: 15, position: '外野手' },
    { name: 'MASAKI',     email: 'masaki@blitz.jp',      number: 16, position: '外野手' },
    { name: 'ひかる',     email: 'hikaru@blitz.jp',      number: 17, position: '投手' },
    { name: 'K.KAZU',     email: 'kkazu@blitz.jp',       number: 18, position: '内野手' },
    { name: 'とら',       email: 'tora@blitz.jp',        number: 23, position: '外野手' },
    { name: 'ゆみ',       email: 'yumi@blitz.jp',        number: 24, position: '外野手' },
    { name: 'なかしょう', email: 'nakasho@blitz.jp',    number: 25, position: '捕手' },
    { name: 'fa-ta',      email: 'fata@blitz.jp',        number: 30, position: '内野手' },
    { name: 'MASA',       email: 'masa@blitz.jp',        number: 42, position: '内野手' },
    { name: '北條',       email: 'hojo@blitz.jp',        number: 51, position: '外野手' },
    { name: 'KAZUHO',     email: 'kazuho@blitz.jp',      number: 55, position: '内野手' },
    { name: 'Giwao',      email: 'giwao@blitz.jp',       number: 66, position: '内野手' },
    { name: '伸吾',       email: 'shingo@blitz.jp',      number: 69, position: '内野手' },
  ]
  await Promise.all(playerData.map(p =>
    prisma.user.create({ data: { ...p, password: playerPw, role: 'PLAYER' } })
  ))
  console.log(`Created ${playerData.length} players`)

  // 試合結果登録（229試合）
  const dateIdx: Record<string, number> = {}
  let count = 0

  for (const g of games) {
    const idx = dateIdx[g.date] ?? 0
    dateIdx[g.date] = idx + 1

    const d = new Date(`${g.date}T10:00:00`)
    d.setHours(10 + idx * 3)

    const { ourScore, opponentScore } = parseScore(g.score, g.win)

    const schedule = await prisma.schedule.create({
      data: {
        date: d, opponent: g.opponent,
        location: '加古川河川敷両荘グラウンド',
        type: g.type, startTime: `${d.getHours()}:00`, meetTime: '8:30',
      },
    })
    await prisma.game.create({
      data: { scheduleId: schedule.id, ourScore, opponentScore, result: g.win },
    })
    count++
  }
  console.log(`Created ${count} games`)

  // 今後の日程
  await prisma.schedule.create({
    data: {
      date: new Date('2026-06-21T08:00:00'), opponent: 'シンバキャツ',
      location: '加古川河川敷両荘グラウンド', type: 'TOURNAMENT',
      startTime: '8:00', meetTime: '7:30', note: 'AHMリーグ（公式戦）',
    },
  })
  await prisma.schedule.create({
    data: {
      date: new Date('2026-06-21T11:00:00'), opponent: '播州塁球',
      location: '加古川河川敷両荘グラウンド', type: 'TOURNAMENT',
      startTime: '11:00', meetTime: '7:30', note: 'AHMリーグ（公式戦）',
    },
  })

  console.log('Seed completed!')
  console.log('Admin: admin@blitz.jp / admin123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
