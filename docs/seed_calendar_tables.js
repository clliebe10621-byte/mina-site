'use strict';

/**
 * calendar_events / default_schedule テーブル作成 + 初期データ投入
 *
 * 実行前: aws sts get-caller-identity で認証確認
 * 実行:   node seed_calendar_tables.js
 */

const { DynamoDBClient, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const db     = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(db);

const SESSION_ID = 'session_001';

// ── テーブル作成ヘルパー ──────────────────────────────────────────

async function createTable(name, pk, sk) {
    try {
        await db.send(new CreateTableCommand({
            TableName: name,
            AttributeDefinitions: [
                { AttributeName: pk, AttributeType: 'S' },
                { AttributeName: sk, AttributeType: 'S' }
            ],
            KeySchema: [
                { AttributeName: pk, KeyType: 'HASH' },
                { AttributeName: sk, KeyType: 'RANGE' }
            ],
            BillingMode: 'PAY_PER_REQUEST'
        }));
        console.log(`${name}: 作成中...`);
        await new Promise(r => setTimeout(r, 5000));
        console.log(`${name}: 作成完了`);
    } catch (e) {
        if (e.name === 'ResourceInUseException') {
            console.log(`${name}: すでに存在します。スキップ。`);
        } else {
            throw e;
        }
    }
}

// ── デフォルトスケジュール初期データ ─────────────────────────────

const defaultSchedule = {
    sessionId: SESSION_ID,
    SK: 'config',
    weekday: [
        { startHour: 0,  endHour: 5,  locationId: 'home_minato', mode: 'together', label: '湊の家',   bg: 'minato-bedroom-night'   },
        { startHour: 5,  endHour: 7,  locationId: 'home_minato', mode: 'together', label: '湊の家・朝', bg: 'minato-bedroom-morning' },
        { startHour: 7,  endHour: 9,  locationId: 'home_minato', mode: 'together', label: '湊の家',   bg: 'minato-living-day'      },
        { startHour: 9,  endHour: 18, locationId: 'workplace',   mode: 'line',     label: '職場',     bg: 'minato-office-day'      },
        { startHour: 18, endHour: 23, locationId: 'home_minato', mode: 'together', label: '湊の家',   bg: 'minato-living-night'    },
        { startHour: 23, endHour: 24, locationId: 'home_minato', mode: 'together', label: '湊の家',   bg: 'minato-bedroom-night'   }
    ],
    weekend: [
        { startHour: 0,  endHour: 7,  locationId: 'home_minato', mode: 'together', label: '湊の家',   bg: 'minato-bedroom-night'   },
        { startHour: 7,  endHour: 9,  locationId: 'home_minato', mode: 'together', label: '湊の家・朝', bg: 'minato-bedroom-morning' },
        { startHour: 9,  endHour: 12, locationId: 'home_minato', mode: 'together', label: '湊の家',   bg: 'minato-living-day'      },
        { startHour: 12, endHour: 17, locationId: 'cafe',        mode: 'together', label: 'カフェ',   bg: 'cafe-day'               },
        { startHour: 17, endHour: 20, locationId: 'home_minato', mode: 'together', label: '湊の家',   bg: 'minato-living-day'      },
        { startHour: 20, endHour: 23, locationId: 'home_minato', mode: 'together', label: '湊の家',   bg: 'minato-living-night'    },
        { startHour: 23, endHour: 24, locationId: 'home_minato', mode: 'together', label: '湊の家',   bg: 'minato-bedroom-night'   }
    ],
    updatedAt: new Date().toISOString()
};

// ── メイン ────────────────────────────────────────────────────────

async function main() {
    await createTable('calendar_events',  'sessionId', 'SK');
    await createTable('default_schedule', 'sessionId', 'SK');

    await docClient.send(new PutCommand({
        TableName: 'default_schedule',
        Item: defaultSchedule
    }));
    console.log('デフォルトスケジュール投入完了');
    console.log('完了。');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
