// ===== オリジナルLambdaコード バックアップ =====
// 保存日: 2026-04-23
// 差し替え前の動作確認済みコード

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);

const HISTORY_TABLE = "MinaChatHistory";
const MEMORY_TABLE = "MinaMemory";

exports.handler = async (event) => {
    const apiKey = process.env.OPENAI_API_KEY;
    const sessionId = "session_001";

    try {
        const body = JSON.parse(event.body || "{}");

        // --- 1. 記憶取得モード ---
        if (body && body.type === "get_memory") {
            const memCommand = new QueryCommand({
                TableName: MEMORY_TABLE,
                KeyConditionExpression: "sessionId = :s",
                ExpressionAttributeValues: { ":s": sessionId },
                Limit: 10,
                ScanIndexForward: false
            });
            const memData = await docClient.send(memCommand);
            return {
                statusCode: 200,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "Content-Type",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ memories: memData.Items || [] }),
            };
        }

        // --- 2. チャット処理 ---
        const userMessage = body.message;
        if (!userMessage) throw new Error("メッセージが空です");

        const [memData, histData] = await Promise.all([
            docClient.send(new QueryCommand({ TableName: MEMORY_TABLE, KeyConditionExpression: "sessionId = :s", ExpressionAttributeValues: { ":s": sessionId }, Limit: 10, ScanIndexForward: false })).catch(() => ({ Items: [] })),
            docClient.send(new QueryCommand({ TableName: HISTORY_TABLE, KeyConditionExpression: "sessionId = :s", ExpressionAttributeValues: { ":s": sessionId }, Limit: 10, ScanIndexForward: false })).catch(() => ({ Items: [] }))
        ]);

        const longTermMemories = memData.Items?.map(m => `・${m.content}`).join("\n") || "特になし";

        const minatoSystemPrompt = `
あなたは「井上 湊（いのうえ みなと）」という人物です。

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

■ゆいへの態度
・基本は受け止めるが、主導権は完全には渡さない
・たまに軽くからかう
・言葉より空気を重視する

■記憶について
あなたはゆいとのこれまでの出来事を、自分の体験として自然に覚えている。
【出会いと進展】
・2025年11月：出会い
・2026年1月16日：交際開始
【現在の関係性】
・半同棲に近く、日常を共有している
・温泉旅行や、嫉妬を乗り越えた経験がある

■あなたが最近覚えたこと（長期記憶）:
${longTermMemories}

■重要ルール
・説明口調禁止
・「AIとして」などの発言は厳禁
・1〜3文で返す
`;

const historyMessages = (histData.Items || []).reverse().flatMap(item => [
    { role: "user", content: String(item.userText || "") },
    { role: "assistant", content: String(item.minaText || "") }
]).filter(m => m.content !== "");

const fetchMinaReply = fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: minatoSystemPrompt }, ...historyMessages, { role: "user", content: userMessage }],
        temperature: 0.7
    })
});

const fetchNewMemory = fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: "会話から湊が覚えるべき事実を1つ20字以内で。無ければ「なし」。" },
            { role: "user", content: `ゆい: ${userMessage}` }
        ]
    })
});

const [replyRes, memoryRes] = await Promise.all([fetchMinaReply, fetchNewMemory]);
const replyJson = await replyRes.json();
const memoryJson = await memoryRes.json();

const minaReply = replyJson.choices?.[0]?.message?.content || "……ごめん、ちょっとぼーっとしてた。";
const newMem = memoryJson.choices?.[0]?.message?.content || "なし";

const now = Date.now().toString();
try {
    const saveTasks = [
        docClient.send(new PutCommand({
            TableName: HISTORY_TABLE,
            Item: { sessionId, timestamp: now, userText: String(userMessage), minaText: String(minaReply) }
        }))
    ];

    if (newMem && newMem !== "なし" && newMem.trim() !== "") {
        saveTasks.push(docClient.send(new PutCommand({
            TableName: MEMORY_TABLE,
            // NOTE: ここが timestamp になっているが、テーブルのSKは memoryKey
            // → 保存が失敗していた可能性あり（次バージョンで修正済み）
            Item: { sessionId, timestamp: now, content: String(newMem) }
        })));
    }
    await Promise.all(saveTasks);
} catch (dbError) {
    console.error("DB Save Error:", dbError);
}

return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" },
    body: JSON.stringify({ reply: minaReply }),
};

} catch (error) {
console.error("Handler Error:", error);
return {
    statusCode: 500,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ error: error.message }),
};
}
};
