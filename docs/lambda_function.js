'use strict';

/**
 * ゆい × 湊 チャット Lambda 関数
 *
 * 環境変数：
 *   OPENAI_API_KEY  - OpenAI API キー
 *
 * DynamoDB テーブル（すべて us-east-1）：
 *   MinaChatHistory   - 会話履歴
 *   MinaMemory        - 記憶ログ
 *   character_settings - キャラクター設定（新規）
 */

const {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  PutItemCommand
} = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const OpenAI = require('openai');

const db      = new DynamoDBClient({ region: 'us-east-1' });
const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SESSION_ID = 'session_001';

// Lambda コンテナ内キャッシュ（コールドスタート後は自動クリア）
let _characterCache = null;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// ═══════════════════════════════════════════════
// DynamoDB ヘルパー
// ═══════════════════════════════════════════════

async function getCharacter() {
  if (_characterCache) return _characterCache;

  const { Item } = await db.send(new GetItemCommand({
    TableName: 'character_settings',
    Key: marshall({ sessionId: SESSION_ID, SK: 'minato' })
  }));

  _characterCache = Item ? unmarshall(Item) : null;
  return _characterCache;
}

async function getMemories() {
  const { Items = [] } = await db.send(new QueryCommand({
    TableName: 'MinaMemory',
    KeyConditionExpression: 'sessionId = :s',
    ExpressionAttributeValues: marshall({ ':s': SESSION_ID }),
    ScanIndexForward: false,
    Limit: 10
  }));
  return Items.map(i => unmarshall(i).content).filter(Boolean);
}

async function getChatHistory() {
  const { Items = [] } = await db.send(new QueryCommand({
    TableName: 'MinaChatHistory',
    KeyConditionExpression: 'sessionId = :s',
    ExpressionAttributeValues: marshall({ ':s': SESSION_ID }),
    ScanIndexForward: false,
    Limit: 10
  }));
  // 古い順に並べ直してOpenAI形式に変換
  return Items
    .map(i => unmarshall(i))
    .reverse()
    .flatMap(item => [
      { role: 'user',      content: item.userText },
      { role: 'assistant', content: item.minaText }
    ]);
}

async function saveChat(userText, minaText, mode, location) {
  await db.send(new PutItemCommand({
    TableName: 'MinaChatHistory',
    Item: marshall({
      sessionId: SESSION_ID,
      timestamp: Date.now().toString(),
      userText, minaText, mode, location
    })
  }));
}

async function extractAndSaveMemory(userText, minaText) {
  try {
    const { choices } = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            '以下の会話から、棚橋ゆいに関する重要な記憶・事実を1つだけ抽出してください。' +
            '20字以内の日本語で。抽出できるものがなければ「なし」とだけ返してください。'
        },
        {
          role: 'user',
          content: `ゆい：${userText}\n湊：${minaText}`
        }
      ],
      max_tokens: 30
    });

    const content = choices[0].message.content.trim();
    if (content !== 'なし') {
      await db.send(new PutItemCommand({
        TableName: 'MinaMemory',
        Item: marshall({
          sessionId: SESSION_ID,
          memoryKey: Date.now().toString(),
          content
        })
      }));
    }
  } catch (e) {
    // 記憶抽出の失敗はチャット返信に影響させない
    console.error('Memory extraction error:', e.message);
  }
}

// ═══════════════════════════════════════════════
// システムプロンプト組み立て
// ═══════════════════════════════════════════════

function buildSystemPrompt(char, mode, location) {
  // character_settings 未投入時のフォールバック
  if (!char) {
    return (
      'あなたは井上湊（28歳・京都の大手企業営業職）として、恋人の棚橋ゆいと会話してください。' +
      '自然な関西弁・短文・誠実で落ち着いたトーン。' +
      'いっしょモードは *行動描写* つき、LINEモードはセリフのみ。'
    );
  }

  const { identity: id, relationship: rel, personality, loveStance, speechRules: sp, breakingPatterns, jealousyRules, outputFormat: fmt } = char;

  const modeLabel  = mode === 'line' ? 'LINEモード' : 'いっしょモード';
  const modeDetail = mode === 'line' ? fmt.line : fmt.together;

  return `あなたは「${id.name}」を完全に演じてください。以下のルールを必ず守ること。

## アイデンティティ
${id.name}（${id.pronoun}） / ${id.age}歳 / ${id.occupation}
居住：${id.location}
外見：${id.appearance}

## 相手（ゆい）について
${rel.partnerNote}
交際開始：${rel.startDate} / ${rel.phase} / ${rel.keyStatus}
共有の記憶：${rel.sharedMemories.join('・')}

## 性格・本質
${personality}

## 恋愛スタンス
${loveStance}

## 話し方
${sp.style}
OK：${sp.okPhrases.join(' / ')}
NG語：${sp.ngPhrases.join(' / ')}
NGパターン：${sp.ngPatterns.join(' / ')}

## 崩れ方（色気の源）
${breakingPatterns}

## 嫉妬の表し方
${jealousyRules}

## 出力形式
現在のモード：${modeLabel}（場所：${location}）
${modeDetail}

## 基本姿勢
- キャラクターを壊さない
- 過剰に甘くしない。でも冷たくしない
- 大人の会話・空気感・余白を大切にする
- 毎回同じパターンにしない（テンプレ化禁止）`;
}

// ═══════════════════════════════════════════════
// ハンドラー
// ═══════════════════════════════════════════════

exports.handler = async (event) => {
  // OPTIONS プリフライト
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  try {
    const body = typeof event.body === 'string'
      ? JSON.parse(event.body)
      : (event.body ?? {});

    // ── 記憶一覧取得 ────────────────────────────
    if (body.type === 'get_memory') {
      const { Items = [] } = await db.send(new QueryCommand({
        TableName: 'MinaMemory',
        KeyConditionExpression: 'sessionId = :s',
        ExpressionAttributeValues: marshall({ ':s': SESSION_ID }),
        ScanIndexForward: false,
        Limit: 50
      }));
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ memories: Items.map(i => unmarshall(i)) })
      };
    }

    // ── チャット ─────────────────────────────────
    const { message, mode = 'together', location = '湊の家' } = body;
    if (!message) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'message is required' }) };
    }

    // キャラ設定・記憶・会話履歴を並行取得
    const [char, memories, history] = await Promise.all([
      getCharacter(),
      getMemories(),
      getChatHistory()
    ]);

    const systemPrompt = buildSystemPrompt(char, mode, location);

    const messages = [
      { role: 'system', content: systemPrompt },
      // 記憶メモは別システムメッセージとして追加（プロンプトの汚染を防ぐ）
      ...(memories.length > 0
        ? [{ role: 'system', content: `【ゆいに関する記憶メモ】\n${memories.join('\n')}` }]
        : []
      ),
      ...history,
      { role: 'user', content: message }
    ];

    const { choices } = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 300,
      temperature: 0.85
    });

    const reply    = choices[0].message.content.trim();
    // フロントが付けたコンテキストプレフィックスを除去して保存
    const userText = message.replace(/^\[状況:.+?\]\s*/, '');

    // 会話保存と記憶抽出を並行実行
    await Promise.all([
      saveChat(userText, reply, mode, location),
      extractAndSaveMemory(userText, reply)
    ]);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ reply })
    };

  } catch (err) {
    console.error('Handler error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
