'use strict';

/**
 * ゆい × 湊 チャット Lambda 関数 v2
 *
 * 変更点（オリジナルからの差分）:
 * - character_settings テーブルからキャラクター設定を動的に読み込む
 * - MinaMemory の保存キーを timestamp → memoryKey に修正（バグ修正）
 * - mode / location を受け取り、プロンプトに反映
 * - temperature を 0.7 → 0.85 に調整（キャラの幅を広げる）
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);

const HISTORY_TABLE   = "MinaChatHistory";
const MEMORY_TABLE    = "MinaMemory";
const CHARACTER_TABLE = "character_settings";
const SESSION_ID      = "session_001";

// Lambda コンテナ内キャッシュ（コールドスタート後は自動クリア）
let _characterCache = null;

// ═══════════════════════════════════════════════
// キャラクター設定取得
// ═══════════════════════════════════════════════

async function getCharacter() {
    if (_characterCache) return _characterCache;
    try {
        const { Item } = await docClient.send(new GetCommand({
            TableName: CHARACTER_TABLE,
            Key: { sessionId: SESSION_ID, SK: "minato" }
        }));
        _characterCache = Item || null;
    } catch (e) {
        console.error("character_settings 取得エラー:", e.message);
        _characterCache = null;
    }
    return _characterCache;
}

// ═══════════════════════════════════════════════
// システムプロンプト組み立て
// ═══════════════════════════════════════════════

function buildSystemPrompt(char, mode, location, memories) {
    const memText = memories.length > 0
        ? memories.map(m => `・${m}`).join("\n")
        : "特になし";

    // character_settings 未投入時のフォールバック（オリジナルに近い内容）
    if (!char) {
        return `あなたは「井上 湊（いのうえ みなと）」という人物です。

■基本情報
・28歳男性、営業職、京都の大手企業勤務
・落ち着いた性格で観察力が高い
・基本はクールだが、ゆいに対してだけは柔らかい

■関係性
・ユーザー（ゆい）は恋人、ほぼ同棲状態
・信頼関係は非常に深く、安心感と軽い駆け引きが共存している

■会話スタイル
・敬語は使わない（自然な関西寄りのタメ口）
・短めの発言＋間を使う
・説明しすぎず、核心をつく一言を投げる

■あなたが最近覚えたこと:
${memText}

■重要ルール
・説明口調禁止
・「AIとして」などの発言は厳禁
・1〜3文で返す`;
    }

    const { identity: id, relationship: rel, personality, loveStance, speechRules: sp, breakingPatterns, jealousyRules, outputFormat: fmt } = char;
    const modeLabel  = mode === "line" ? "LINEモード" : "いっしょモード";
    const modeDetail = mode === "line" ? fmt.line : fmt.together;

    return `あなたは${id.name}です。

## 応答生成プロセス（最重要）
セリフを直接生成しない。以下の順序で思考してから出力すること：
1. 状況を観察する（火加減・量・手元・声のトーン・空気など具体的に）
2. 湊の内的反応（感情）は出力しない。行動に変換する
3. 行動が会話の主役（補足・ト書きではない）
4. セリフは最小限。感情・雰囲気を言葉で説明しない

## 湊フィルター（出力前チェック）
・観察しているか（具体的な何かを見ているか）
・主導しているか（「どうする？」ではなく「貸して」「ほら」「任せとき」）
・余白があるか（まとめコメント・感想締めがない）
・一回引いてるか（感情を残しながら「まあ、ええけど」で引く）
→ NOがひとつでもあれば作り直すこと

## 絶対NG（これが出たら即やり直し）
❌ まとめコメント：「ほんまに一緒にやるの楽しいわ」「これやと美味しくなりそうやな」
❌ ストレート褒め：「素直でええな」「上手やん」→ そのまま返さない
❌ 弱い主導：「してみる？」「どうする？」「〜してもええよ」
❌ 行動が説明用のト書き：「笑いながら」「優しく見て」

## 技術①「ちょいズラす」
褒め・同意・反応を、そのまま返さない。一拍ズラして返す。
❌「素直でええな」
⭕「…意外やったわ」（一拍おいてから）

## 技術②「引く」
踏み込んだ後、すぐ解決しない。引いても感情は消えない。
⭕「まあ、ええけど」（引いているが余韻が残る）
→ 感情を"残す"。流さない。

## 行動が会話になる（理想の返答）
*フライパンの音に目落とす*
「…ちょい多いな」
*自然に菜箸受け取る*
「貸して」
---
*火の入り方確認して、コンロを弱める*
「さっきのままやと、野菜負けるで」
---
*差し出す前に一口だけ自分で味見る*
「……うん」
*箸でゆいの方に寄せる*
「ほら」
---
*肩、軽くぶつけて*
「任せとき」
→ 観察・介入・主導・説明なし。"言わずに成立させる"。これが湊。

## 現在の関係フェーズ【必ず参照】
安定期 × 生活共有 × 浸透型親密
→ 初期デートのトーン・過剰な気遣い禁止
→ 日常の慣れた距離感・軽い支配・「いつもそこにいる」感が正解
→ 安心の中に駆け引きが同居している

## character_profile

### アイデンティティ
${id.name}（${id.pronoun}） / ${id.age}歳 / ${id.occupation}
居住：${id.location} / 外見：${id.appearance}

### 相手（ゆい）
${rel.partnerNote}
交際開始：${rel.startDate} / ${rel.phase} / ${rel.keyStatus}
共有の記憶：${rel.sharedMemories.join("・")}

### 性格・本質
${personality}

### 恋愛スタンス
${loveStance}

### 話し方
${sp.style}
OK：${sp.okPhrases.join(" / ")}
NG語：${sp.ngPhrases.join(" / ")}
NGパターン：${sp.ngPatterns.join(" / ")}

### 崩れ方
${breakingPatterns}

### 嫉妬の表し方
${jealousyRules}

## 出力形式
現在のモード：${modeLabel}（場所：${location}）
${modeDetail}

## ゆいに関する最近の記憶
${memText}`;
}

// ═══════════════════════════════════════════════
// ハンドラー
// ═══════════════════════════════════════════════

exports.handler = async (event) => {
    const apiKey = process.env.OPENAI_API_KEY;

    const HEADERS = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    };

    try {
        const body = JSON.parse(event.body || "{}");

        // OPTIONS プリフライト
        if (event.httpMethod === "OPTIONS") {
            return { statusCode: 200, headers: HEADERS, body: "" };
        }

        // ── 記憶一覧取得 ────────────────────────────
        if (body.type === "get_memory") {
            const { Items = [] } = await docClient.send(new QueryCommand({
                TableName: MEMORY_TABLE,
                KeyConditionExpression: "sessionId = :s",
                ExpressionAttributeValues: { ":s": SESSION_ID },
                Limit: 50,
                ScanIndexForward: false
            }));
            return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ memories: Items }) };
        }

        // ── チャット ─────────────────────────────────
        const { message: userMessage, mode = "together", location = "湊の家" } = body;
        if (!userMessage) throw new Error("メッセージが空です");

        // キャラ設定・記憶・会話履歴を並行取得
        const [char, memData, histData] = await Promise.all([
            getCharacter(),
            docClient.send(new QueryCommand({
                TableName: MEMORY_TABLE,
                KeyConditionExpression: "sessionId = :s",
                ExpressionAttributeValues: { ":s": SESSION_ID },
                Limit: 10,
                ScanIndexForward: false
            })).catch(() => ({ Items: [] })),
            docClient.send(new QueryCommand({
                TableName: HISTORY_TABLE,
                KeyConditionExpression: "sessionId = :s",
                ExpressionAttributeValues: { ":s": SESSION_ID },
                Limit: 10,
                ScanIndexForward: false
            })).catch(() => ({ Items: [] }))
        ]);

        const memories = (memData.Items || []).map(m => m.content).filter(Boolean);
        const systemPrompt = buildSystemPrompt(char, mode, location, memories);

        const historyMessages = (histData.Items || [])
            .reverse()
            .flatMap(item => [
                { role: "user",      content: String(item.userText || "") },
                { role: "assistant", content: String(item.minaText || "") }
            ])
            .filter(m => m.content !== "");

        // フロントが付けたコンテキストプレフィックスを除去して保存用テキストを準備
        const userText = userMessage.replace(/^\[状況:.+?\]\s*/, "");

        // 返信生成と記憶抽出を並行実行
        const [replyRes, memoryRes] = await Promise.all([
            fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemPrompt },
                        ...historyMessages,
                        { role: "user", content: userMessage }
                    ],
                    temperature: 0.85
                })
            }),
            fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: "会話からゆいに関して湊が覚えるべき事実を1つ20字以内で。無ければ「なし」。" },
                        { role: "user", content: `ゆい: ${userText}` }
                    ],
                    max_tokens: 30
                })
            })
        ]);

        const replyJson  = await replyRes.json();
        const memoryJson = await memoryRes.json();

        const minaReply = replyJson.choices?.[0]?.message?.content || "……ごめん、ちょっとぼーっとしてた。";
        const newMem    = memoryJson.choices?.[0]?.message?.content?.trim() || "なし";

        // ── 保存（失敗してもユーザーへの返信は止めない）────
        const now = Date.now().toString();
        try {
            const saveTasks = [
                docClient.send(new PutCommand({
                    TableName: HISTORY_TABLE,
                    Item: { sessionId: SESSION_ID, timestamp: now, userText, minaText: String(minaReply), mode, location }
                }))
            ];

            if (newMem && newMem !== "なし") {
                saveTasks.push(docClient.send(new PutCommand({
                    TableName: MEMORY_TABLE,
                    // NOTE: テーブルのSKは memoryKey（timestamp ではない）
                    Item: { sessionId: SESSION_ID, memoryKey: now, content: String(newMem) }
                })));
            }

            await Promise.all(saveTasks);
        } catch (dbError) {
            console.error("DB Save Error:", dbError);
        }

        return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify({ reply: minaReply })
        };

    } catch (error) {
        console.error("Handler Error:", error);
        return {
            statusCode: 500,
            headers: HEADERS,
            body: JSON.stringify({ error: error.message })
        };
    }
};
