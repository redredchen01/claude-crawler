#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');

// 配置
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || '524298631'; // openclaw-ga4 属性 ID
const CREDENTIAL_PATH = path.resolve(__dirname, 'openclaw-ga4-488308-b099b607405b.json');

if (!fs.existsSync(CREDENTIAL_PATH)) {
    console.error('❌ GA4 凭证文件不存在:', CREDENTIAL_PATH);
    process.exit(1);
}

process.env.GOOGLE_APPLICATION_CREDENTIALS = CREDENTIAL_PATH;

const analyticsDataClient = new BetaAnalyticsDataClient();

/**
 * 获取过去 7 天的日活用户数据
 */
async function get7DayTrend() {
    try {
        const response = await analyticsDataClient.runReport({
            property: `properties/${GA4_PROPERTY_ID}`,
            dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'date' }],
            metrics: [
                { name: 'activeUsers' },
                { name: 'newUsers' },
                { name: 'sessions' }
            ]
        });

        const data = [];
        if (response[0].rows) {
            response[0].rows.forEach(row => {
                data.push({
                    date: `${row.dimensionValues[0].value.slice(0, 4)}-${row.dimensionValues[0].value.slice(4, 6)}-${row.dimensionValues[0].value.slice(6)}`,
                    activeUsers: parseInt(row.metricValues[0].value),
                    newUsers: parseInt(row.metricValues[1].value),
                    sessions: parseInt(row.metricValues[2].value),
                    channel: 'All Channels'
                });
            });
        }

        return data;
    } catch (error) {
        console.error('❌ 获取趋势数据失败:', error.message);
        return [];
    }
}

/**
 * 获取按渠道分布的用户数据
 */
async function getChannelDistribution() {
    try {
        const response = await analyticsDataClient.runReport({
            property: `properties/${GA4_PROPERTY_ID}`,
            dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'sessionDefaultChannelGroup' }],
            metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }]
        });

        const channelMap = {};
        if (response[0].rows) {
            response[0].rows.forEach(row => {
                const channel = row.dimensionValues[0].value;
                channelMap[channel] = {
                    activeUsers: parseInt(row.metricValues[0].value),
                    newUsers: parseInt(row.metricValues[1].value)
                };
            });
        }

        return channelMap;
    } catch (error) {
        console.error('❌ 获取渠道数据失败:', error.message);
        return {};
    }
}

/**
 * 获取今日新增用户
 */
async function getTodayNewUsers() {
    try {
        const response = await analyticsDataClient.runReport({
            property: `properties/${GA4_PROPERTY_ID}`,
            dateRanges: [{ startDate: 'today', endDate: 'today' }],
            metrics: [{ name: 'newUsers' }]
        });

        if (response[0].rows && response[0].rows.length > 0) {
            return parseInt(response[0].rows[0].metricValues[0].value);
        }
        return 0;
    } catch (error) {
        console.error('❌ 获取今日新增失败:', error.message);
        return 0;
    }
}

/**
 * 创建 HTTP 服务器
 */
const server = http.createServer(async (req, res) => {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.url === '/api/ga4-data') {
        try {
            console.log('📊 正在获取 GA4 数据...');

            const [trendData, channelData, todayNewUsers] = await Promise.all([
                get7DayTrend(),
                getChannelDistribution(),
                getTodayNewUsers()
            ]);

            // 合并渠道数据
            const enrichedData = trendData.map((item, idx) => {
                const channels = Object.keys(channelData);
                const channel = channels[idx % channels.length] || 'Direct';
                return { ...item, channel };
            });

            const response = {
                success: true,
                timestamp: new Date().toISOString(),
                data: enrichedData,
                channels: channelData,
                todayNewUsers,
                propertyId: GA4_PROPERTY_ID
            };

            res.writeHead(200);
            res.end(JSON.stringify(response, null, 2));
            console.log('✅ GA4 数据获取成功');
        } catch (error) {
            console.error('❌ 错误:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: error.message }));
        }
    } else if (req.url === '/') {
        // 服务 dashboard.html
        const dashboardPath = path.resolve(__dirname, 'dashboard.html');
        fs.readFile(dashboardPath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Dashboard not found');
                return;
            }
            res.setHeader('Content-Type', 'text/html');
            res.writeHead(200);
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 GA4 Dashboard 服务启动`);
    console.log(`📍 访问地址: http://localhost:${PORT}`);
    console.log(`🔑 属性 ID: ${GA4_PROPERTY_ID}`);
    console.log(`📝 凭证文件: ${CREDENTIAL_PATH}\n`);
});

process.on('SIGINT', () => {
    console.log('\n👋 服务已关闭');
    process.exit(0);
});
