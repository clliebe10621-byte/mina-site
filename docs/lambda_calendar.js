'use strict';

/**
 * カレンダー Lambda 関数
 *
 * POST body の type フィールドで操作を切り替える:
 *   get_events          - 月別イベント取得
 *   get_today           - 今日のイベント取得（チャット連動用）
 *   create_event        - イベント作成
 *   delete_event        - イベント削除
 *   get_default_schedule    - デフォルトスケジュール取得
 *   save_default_schedule   - デフォルトスケジュール保存
 *
 * DynamoDB テーブル:
 *   calendar_events  PK: sessionId  SK: YYYY-MM-DD#timestamp
 *   default_schedule PK: sessionId  SK: "config"
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);

const CALENDAR_TABLE = "calendar_events";
const SCHEDULE_TABLE = "default_schedule";
const SESSION_ID     = "session_001";

const HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
};

// ── 場所ID → ラベル・モード・背景 マッピング ──────────────────────
const LOCATION_MAP = {
    home_minato: { label: "湊の家",       mode: "together" },
    home_yui:    { label: "ゆいの家",     mode: "together" },
    workplace:   { label: "職場",         mode: "line"     },
    cafe:        { label: "カフェ",       mode: "together" },
    date_out:    { label: "外出・デート", mode: "together" },
    travel:      { label: "旅行先",       mode: "together" }
};

// ═══════════════════════════════════════════════
// ハンドラー
// ═══════════════════════════════════════════════

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") {
            return { statusCode: 200, headers: HEADERS, body: "" };
        }

        const body = JSON.parse(event.body || "{}");
        const { type } = body;

        switch (type) {

            // ── 月別イベント取得 ────────────────────────────
            case "get_events": {
                const { yearMonth } = body; // "2026-04"
                if (!yearMonth) throw new Error("yearMonth が必要です");

                const { Items = [] } = await docClient.send(new QueryCommand({
                    TableName: CALENDAR_TABLE,
                    KeyConditionExpression: "sessionId = :s AND begins_with(SK, :ym)",
                    ExpressionAttributeValues: { ":s": SESSION_ID, ":ym": yearMonth }
                }));

                return ok({ events: Items });
            }

            // ── 今日のイベント取得（チャット連動用）───────────
            case "get_today": {
                const { date } = body; // "2026-04-27"
                if (!date) throw new Error("date が必要です");

                const { Items = [] } = await docClient.send(new QueryCommand({
                    TableName: CALENDAR_TABLE,
                    KeyConditionExpression: "sessionId = :s AND begins_with(SK, :d)",
                    ExpressionAttributeValues: { ":s": SESSION_ID, ":d": date }
                }));

                // 現在時刻に該当するイベントを先頭に返す
                const now = new Date();
                const currentMinutes = now.getHours() * 60 + now.getMinutes();

                const active = Items.filter(ev => {
                    if (!ev.startTime) return true; // 時間指定なし → 終日
                    const [sh, sm] = ev.startTime.split(":").map(Number);
                    const [eh, em] = (ev.endTime || "23:59").split(":").map(Number);
                    const start = sh * 60 + sm;
                    const end   = eh * 60 + em;
                    return currentMinutes >= start && currentMinutes < end;
                });

                // location情報を付加
                const enriched = active.map(ev => ({
                    ...ev,
                    ...(LOCATION_MAP[ev.locationId] || {})
                }));

                return ok({ events: enriched });
            }

            // ── イベント作成 ────────────────────────────────
            case "create_event": {
                const { event: ev } = body;
                if (!ev || !ev.date || !ev.title) throw new Error("date と title は必須です");

                const eventId = `${ev.date}#${Date.now()}`;
                const item = {
                    sessionId: SESSION_ID,
                    SK:        eventId,
                    eventId,
                    date:      ev.date,
                    title:     ev.title,
                    type:      ev.type      || "plan",
                    locationId:ev.locationId|| "home_minato",
                    mode:      ev.mode      || LOCATION_MAP[ev.locationId]?.mode || "together",
                    label:     LOCATION_MAP[ev.locationId]?.label || ev.label || "湊の家",
                    startTime: ev.startTime || null,
                    endTime:   ev.endTime   || null,
                    createdAt: new Date().toISOString()
                };

                await docClient.send(new PutCommand({ TableName: CALENDAR_TABLE, Item: item }));
                return ok({ event: item });
            }

            // ── イベント削除 ────────────────────────────────
            case "delete_event": {
                const { eventId } = body;
                if (!eventId) throw new Error("eventId が必要です");

                await docClient.send(new DeleteCommand({
                    TableName: CALENDAR_TABLE,
                    Key: { sessionId: SESSION_ID, SK: eventId }
                }));

                return ok({ success: true });
            }

            // ── デフォルトスケジュール取得 ──────────────────
            case "get_default_schedule": {
                const { Item } = await docClient.send(new GetCommand({
                    TableName: SCHEDULE_TABLE,
                    Key: { sessionId: SESSION_ID, SK: "config" }
                }));

                return ok({ schedule: Item || null });
            }

            // ── デフォルトスケジュール保存 ──────────────────
            case "save_default_schedule": {
                const { schedule } = body;
                if (!schedule || !schedule.weekday || !schedule.weekend) {
                    throw new Error("schedule.weekday / weekend が必要です");
                }

                const item = {
                    sessionId: SESSION_ID,
                    SK:        "config",
                    weekday:   schedule.weekday,
                    weekend:   schedule.weekend,
                    updatedAt: new Date().toISOString()
                };

                await docClient.send(new PutCommand({ TableName: SCHEDULE_TABLE, Item: item }));
                return ok({ success: true });
            }

            default:
                return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "不明な type です" }) };
        }

    } catch (error) {
        console.error("Calendar Handler Error:", error);
        return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: error.message }) };
    }
};

function ok(data) {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify(data) };
}
