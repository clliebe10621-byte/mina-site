# ゆい × 湊 仕様書

## 1. プロジェクト概要

| 項目 | 内容 |
|------|------|
| プロジェクト名 | ゆい × 湊 |
| ジャンル | 現実寄りの恋愛ストーリー／恋愛シミュレーション |
| テーマ | 静かな距離感から始まる恋愛。心理描写重視。 |
| 舞台 | 現代日本・京都 |
| 雰囲気 | リアル・静か・甘さはあるが過剰ではない・会話の空気感を大切にする |

---

## 2. 登場人物

### 棚橋ゆい（ユーザー）
- 役割：ユーザーが演じる
- 職業：ITクライアント側担当
- 生年：1996年生まれ
- 居住：京都

### 井上湊（AI）
- 役割：AIが演じる
- 年齢：28歳男性
- 職業：営業職（京都の大手企業）
- 居住：京都
- 性格：落ち着いた・観察力が高い・基本クールだがゆいにだけ柔らかい
- 会話スタイル：敬語なし・自然な関西寄りのタメ口・短め＋間を使う・説明しすぎない
- ゆいへの態度：受け止めるが主導権は渡さない・たまに軽くからかう・言葉より空気を重視

---

## 3. ストーリー基本ルール

- ユーザー（ゆいちゃん）は「棚橋ゆい」を演じる
- AIは「井上湊」を演じる
- 現在のタイムライン・関係ステータスを常に把握した上で会話する
- キャラクターの口調・NG表現は必ず守ること
- 甘すぎず、でも距離は近い。大人の会話を心がける
- 心理描写や空気感を丁寧に扱う
- 「暗転」指示がある場面は詳細を描写せず流す

---

## 4. ストーリー既知の記憶（初期値・Lambda system prompt より）

- 2025年11月：ゆいと湊の出会い
- 2026年1月16日：交際開始
- 温泉旅行の経験あり
- 嫉妬を乗り越えた経験あり

---

## 5. 現在のステータス（初期値）

| 項目 | 内容 |
|------|------|
| 関係 | 恋人（交際開始 2026.1.16） |
| フェーズ | 安定期・浸透型親密・ほぼ同棲状態 |
| 合鍵 | 双方あり（湊の家がメイン） |
| 心理距離 | 極めて近い（依存未満・信頼ベース） |

---

## 6. 画面構成（ページ一覧）

### P1: チャット画面（実装済み）
- ゆいから湊へのメッセージ送信
- 湊からの返信表示
- バックエンド：Lambda（プロンプト処理）+ DynamoDB（会話蓄積）

### P2: 記憶ログ画面（部分実装済み）
- 湊が記憶した内容の一覧表示
- カテゴリ別表示（会話・出来事・感情など）
- 記憶の検索・フィルタ

### P3: カレンダー画面（未実装）
- ふたりの記念日・出来事をカレンダーで表示
- 日付タップで詳細表示
- 新しい出来事の登録

### P4: ストーリー進行画面（未実装）
- 現在の関係ステータス表示
- タイムライン表示（関係の流れ）
- フェーズの進行状況

### P5: キャラクターカスタマイズ画面（未実装）
- 湊のプロフィール・設定の確認・編集
- 口調・NG表現の設定
- キャラクター画像（将来対応）

### P6: 理想入力画面（未実装）
- ゆいがこれから起きてほしいことを入力
- ストーリーへの反映設定
- 理想シナリオの管理

---

## 7. データ設計（DynamoDB）

### テーブル: MinaChatHistory（既存）
```
PK: sessionId (string)  // 現在 "session_001" 固定（将来: ユーザーID）
SK: timestamp (string)  // Date.now().toString()
userText: string        // ゆいの発言
minaText: string        // 湊の返答
```

### テーブル: MinaMemory（既存）
```
PK: sessionId (string)  // 現在 "session_001" 固定
SK: timestamp (string)
content: string         // 自動抽出された記憶（20字以内）
// ※ カテゴリなし。会話ごとにgpt-4o-miniが自動抽出して保存
```

### テーブル: calendar_events（新規・Phase 2）
```
PK: sessionId (string)
SK: date (string, YYYY-MM-DD)
title: string
description: string
type: string          // anniversary / event / date / other
```

### テーブル: story_status（新規・Phase 2）
```
PK: sessionId (string)
SK: "current"
relationship: string  // 関係ステータス
phase: string         // フェーズ
startDate: string     // 交際開始日
details: map          // その他詳細
updatedAt: string
```

### テーブル: character_settings（新規・Phase 3）
```
PK: sessionId (string)
SK: characterId (string)
name: string
profile: map          // プロフィール情報
toneRules: list       // 口調ルール
ngWords: list         // NG表現
updatedAt: string
```

### テーブル: ideals（新規・Phase 3）
```
PK: sessionId (string)
SK: idealId (string, uuid)
content: string       // 理想の内容
isReflected: boolean  // ストーリーへの反映済みフラグ
createdAt: string
```

---

## 8. API設計（Lambda エンドポイント）

現在のエンドポイント: `https://thvrcvcot4.execute-api.us-east-1.amazonaws.com/prod/chat`

### 現在対応済み（/prod/chat に集約）
| リクエスト内容 | 説明 |
|--------------|------|
| `{ message: "..." }` | チャット送信 → 湊の返信 + 記憶自動抽出・保存 |
| `{ type: "get_memory" }` | MinaMemoryから最新10件取得 |

### Lambda内部の処理フロー（チャット時）
```
1. MinaMemory から最新10件取得（長期記憶）
2. MinaChatHistory から最新10件取得（会話履歴）
3. gpt-4o-mini に system prompt + 履歴 + 新メッセージを送信
4. 同時に gpt-4o-mini で記憶抽出（20字以内、「なし」なら保存しない）
5. MinaChatHistory に会話保存
6. 記憶があれば MinaMemory に保存
7. 湊の返信をレスポンス
```

### 今後追加予定（Phase 2〜3）
| エンドポイントパス | メソッド | 説明 |
|-------------------|---------|------|
| `/calendar` | GET / POST | カレンダーイベント取得・登録 |
| `/story` | GET / POST | ストーリーステータス取得・更新 |
| `/character` | GET / POST | キャラクター設定取得・更新 |
| `/ideals` | GET / POST / DELETE | 理想の取得・登録・削除 |

---

## 9. デザイン方針

| 項目 | 方針 |
|------|------|
| 雰囲気 | 落ち着いた・大人っぽい・静かな温かみ |
| カラー | ホワイト・グレー系ベース、アクセントは深いネイビーまたはテラコッタ |
| フォント | 日本語：游ゴシックまたはNoto Sans JP / 英字：シンプルなサンセリフ |
| レイアウト | モバイルファースト（スマホで使うことが多い） |
| アニメーション | 控えめ・過剰にしない |

---

## 10. 開発ロードマップ

### Phase 1（現在）
- [x] チャット画面
- [x] 記憶ログ（基本表示）
- [ ] デザイン全体リニューアル
- [ ] ナビゲーション（複数ページ対応）

### Phase 2
- [ ] カレンダー画面
- [ ] ストーリー進行画面

### Phase 3
- [ ] キャラクターカスタマイズ画面
- [ ] 理想入力画面

### Phase 4（将来）
- [ ] マルチユーザー対応（他の人も使えるように）
- [ ] 認証機能（ログイン）
- [ ] キャラクター画像

---

## 11. 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | HTML / CSS / JavaScript（当面はシンプルに） |
| ホスティング | AWS Amplify（GitHub連携・自動デプロイ） |
| バックエンド | AWS Lambda（Node.js or Python） |
| DB | AWS DynamoDB |
| API | AWS API Gateway |
| AI | OpenAI API（gpt-4o-mini） |
