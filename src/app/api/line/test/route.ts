import { NextResponse } from 'next/server'

export async function GET() {
  const token   = process.env.LINE_CHANNEL_ACCESS_TOKEN
  const groupId = process.env.LINE_GROUP_ID

  if (!token || !groupId) {
    return NextResponse.json({
      error: '環境変数が未設定',
      token:   token   ? `${token.slice(0, 10)}...` : 'なし',
      groupId: groupId ? `${groupId.slice(0, 10)}...` : 'なし',
    })
  }

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: groupId,
      messages: [{ type: 'text', text: 'BLITZからのテスト送信です 🎉' }],
    }),
  })

  const body = await res.text()

  return NextResponse.json({
    status:  res.status,
    ok:      res.ok,
    body,
    token:   `${token.slice(0, 10)}...（${token.length}文字）`,
    groupId: `${groupId.slice(0, 10)}...`,
  })
}
