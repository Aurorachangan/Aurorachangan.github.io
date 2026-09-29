const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || 'lishang-local-development-secret-change-me';
const databaseDirectory = path.join(__dirname, 'data');
const databasePath = path.join(databaseDirectory, 'lishang.sqlite');
fs.mkdirSync(databaseDirectory, { recursive: true });
const database = new sqlite3.Database(databasePath);

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'codes')));

// 健康检查端点，供前端探测后端是否已启动
app.get('/api/health', (request, response) => {
    response.json({ status: 'ok', service: 'lishang-ai-assistant', time: new Date().toISOString() });
});

function run(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        database.run(sql, parameters, function (error) {
            if (error) reject(error);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

function get(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        database.get(sql, parameters, (error, row) => error ? reject(error) : resolve(row));
    });
}

function all(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        database.all(sql, parameters, (error, rows) => error ? reject(error) : resolve(rows));
    });
}

function createToken(user) {
    return jwt.sign({ userId: user.id, username: user.username }, jwtSecret, { expiresIn: '7d' });
}

function authRequired(request, response, next) {
    const authorization = request.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return response.status(401).json({ message: '请先登录' });
    try {
        request.user = jwt.verify(token, jwtSecret);
        next();
    } catch (error) {
        return response.status(401).json({ message: '登录已失效，请重新登录' });
    }
}

async function logOperation(userId, action, detail = '') {
    await run('INSERT INTO operation_logs (user_id, action, detail, create_time) VALUES (?, ?, ?, datetime(\'now\'))', [userId || null, action, detail]);
}

const seedProfiles = [
    ['张', '一凡', '北京大学', '真实种草', '雅诗兰黛,兰蔻'],
    ['李', '娜娜', '清华大学', '测评分享', 'SK-II,资生堂'],
    ['王', '一诺', '复旦大学', '生活方式', '宝洁,联合利华'],
    ['赵', '莉莉', '上海交通大学', '真实测评', '欧莱雅,薇诺娜'],
    ['陈', '小花', '浙江大学', '种草推荐', '迪奥,香奈儿'],
    ['刘', '欣茹', '南京大学', '日常分享', '百雀羚,自然堂'],
    ['吴', '梦洁', '武汉大学', '专业测评', '雅漾,理肤泉'],
    ['郑', '雨婷', '中山大学', '真实种草', '纪梵希,圣罗兰'],
    ['孙', '雨绮', '四川大学', '生活方式', '郁美净,美加净'],
    ['周', '雅雯', '华中科技大学', '测评分享', '娇韵诗,希思黎'],
    ['钱', '思涵', '吉林大学', '真实测评', '欧珀莱,丸美'],
    ['徐', '开虹', '山东大学', '种草推荐', '相宜本草,佰草集']
];

const kocCategories = [
    { key: 'beauty', labels: '美妆,护肤', brands: ['花西子,珀莱雅', '兰蔻,资生堂', '薇诺娜,理肤泉'] },
    { key: 'fashion', labels: '时尚,穿搭', brands: ['优衣库,耐克', 'ZARA,李宁', 'HM,阿迪达斯'] },
    { key: 'food', labels: '美食,餐饮', brands: ['喜茶,奈雪', '海底捞,麦当劳', '星巴克,瑞幸'] },
    { key: 'tech', labels: '科技,数码', brands: ['小米,华为', '苹果,联想', '索尼,戴尔'] },
    { key: 'lifestyle', labels: '生活,生活方式', brands: ['网易严选,名创优品', '宜家,无印良品', 'Keep,小红书'] }
];

const audienceProfiles = [
    { key: 'college', label: '大学生', followerBase: 26000, engagementBase: 8.1 },
    { key: 'young-professional', label: '年轻职场', followerBase: 48000, engagementBase: 6.9 },
    { key: 'genz', label: 'Z世代', followerBase: 72000, engagementBase: 9.2 }
];

const normalSurnames = ['徐', '张', '李', '王', '刘', '陈', '杨', '黄', '赵', '周'];
const normalGivenNames = ['开虹', '伟丽', '娜娜', '雨琪', '梦洁', '一帆', '雅雯', '思涵', '子轩', '欣怡'];

function createKocName(categoryIndex, audienceIndex, index) {
    const surname = normalSurnames[Math.floor(index / 3) % normalSurnames.length];
    const givenName = normalGivenNames[(index + categoryIndex * 2 + audienceIndex) % normalGivenNames.length];
    return surname + givenName;
}

const kocSeed = kocCategories.flatMap((category, categoryIndex) => audienceProfiles.flatMap((audience, audienceIndex) =>
    Array.from({ length: 50 }, (_, index) => {
        const profile = seedProfiles[(categoryIndex * 5 + audienceIndex * 3 + index) % seedProfiles.length];
        const followerCount = audience.followerBase + ((index * 3711 + categoryIndex * 1900) % 26000);
        const engagementRate = Number((audience.engagementBase + ((index + categoryIndex) % 7) * 0.23).toFixed(1));
        const conversionRate = Number((2.1 + ((index + audienceIndex) % 8) * 0.19).toFixed(1));
        const riskScore = Number((0.08 + ((index * 3 + categoryIndex + audienceIndex) % 18) / 100).toFixed(2));
        return [
            createKocName(categoryIndex, audienceIndex, index),
            profile[2], followerCount, engagementRate, conversionRate,
            profile[3], category.labels, category.brands[index % category.brands.length], riskScore, audience.key
        ];
    })
));

async function initializeDatabase() {
    await run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        company TEXT NOT NULL DEFAULT '未填写',
        create_time TEXT NOT NULL
    )`);
    await run(`CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        project_name TEXT NOT NULL,
        demand_content TEXT,
        koc_result TEXT,
        schedule_data TEXT,
        create_time TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    await run(`CREATE TABLE IF NOT EXISTS koc_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        university TEXT NOT NULL,
        follower_count INTEGER NOT NULL,
        engagement_rate REAL NOT NULL,
        conversion_rate REAL NOT NULL,
        content_style TEXT NOT NULL,
        categories TEXT NOT NULL,
        past_brands TEXT NOT NULL,
        risk_score REAL NOT NULL,
        audience TEXT NOT NULL DEFAULT 'college'
    )`);
    const kocColumns = await all('PRAGMA table_info(koc_info)');
    if (!kocColumns.some(column => column.name === 'audience')) {
        await run("ALTER TABLE koc_info ADD COLUMN audience TEXT NOT NULL DEFAULT 'college'");
    }
    await run(`CREATE TABLE IF NOT EXISTS compliance_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        input_text TEXT NOT NULL,
        risk_result TEXT NOT NULL,
        create_time TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )`);
    await run(`CREATE TABLE IF NOT EXISTS operation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        detail TEXT,
        create_time TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )`);
    await run(`CREATE TABLE IF NOT EXISTS checkout_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        items TEXT NOT NULL,
        subtotal REAL NOT NULL,
        discount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        payment_method TEXT NOT NULL,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        create_time TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    for (const category of kocCategories) {
        for (const audience of audienceProfiles) {
            const count = await get('SELECT COUNT(*) AS count FROM koc_info WHERE categories = ? AND audience = ?', [category.labels, audience.key]);
            const candidates = kocSeed.filter(item => item[6] === category.labels && item[9] === audience.key);
            const missingCount = Math.max(0, 50 - count.count);
            for (const item of candidates.slice(0, missingCount)) {
                await run(`INSERT INTO koc_info (name, university, follower_count, engagement_rate, conversion_rate, content_style, categories, past_brands, risk_score, audience)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, item);
            }
        }
    }
    const kocRows = await all('SELECT id, name, categories, audience FROM koc_info ORDER BY categories, audience, id');
    const groupIndexes = new Map();
    for (const row of kocRows) {
        const groupKey = `${row.categories}|${row.audience}`;
        const index = groupIndexes.get(groupKey) || 0;
        const categoryIndex = kocCategories.findIndex(category => category.labels === row.categories);
        const audienceIndex = audienceProfiles.findIndex(audience => audience.key === row.audience);
        const normalName = createKocName(Math.max(0, categoryIndex), Math.max(0, audienceIndex), index);
        groupIndexes.set(groupKey, index + 1);
        if (row.name !== normalName) {
            await run('UPDATE koc_info SET name = ? WHERE id = ?', [normalName, row.id]);
        }
    }
}

app.post('/api/checkout/orders', authRequired, async (request, response) => {
    try {
        const kocIds = Array.isArray(request.body.kocIds) ? [...new Set(request.body.kocIds.map(Number).filter(Number.isInteger))] : [];
        if (!kocIds.length || kocIds.length > 100) return response.status(400).json({ message: '请先完成有效的KOC匹配' });
        const matchedRows = await all(`SELECT id, name FROM koc_info WHERE id IN (${kocIds.map(() => '?').join(',')}) ORDER BY id`, kocIds);
        if (matchedRows.length !== kocIds.length) return response.status(400).json({ message: '匹配的KOC数据已变化，请重新匹配' });
        const quantity = kocIds.length;
        const coupon = typeof request.body.coupon === 'string' ? request.body.coupon.trim().toUpperCase() : '';
        const paymentMethod = ['alipay', 'wechat', 'unionpay'].includes(request.body.paymentMethod) ? request.body.paymentMethod : 'alipay';
        const note = typeof request.body.note === 'string' ? request.body.note.trim().slice(0, 200) : '';
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return response.status(400).json({ message: 'KOC投放数量需为1到1000之间的整数' });
        const unitPrice = 280;
        const serviceFee = 2000;
        const subtotal = quantity * unitPrice + serviceFee;
        const discount = coupon === 'SPRING10' ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
        const total = subtotal - discount;
        const orderNo = `SJ${Date.now()}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
        const items = JSON.stringify([{ name: '校园KOC内容投放', quantity, unitPrice, kocIds }, { name: '策略与项目管理服务', quantity: 1, unitPrice: serviceFee }]);
        await run('INSERT INTO checkout_orders (order_no, user_id, items, subtotal, discount, total, payment_method, note, status, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))', [orderNo, request.user.userId, items, subtotal, discount, total, paymentMethod, note, 'pending']);
        await logOperation(request.user.userId, 'checkout_order_create', orderNo);
        response.status(201).json({ order: { orderNo, subtotal, discount, total, paymentMethod, status: 'pending' } });
    } catch (error) {
        response.status(500).json({ message: '结算订单创建失败' });
    }
});

app.post('/api/checkout/orders/:orderNo/pay', authRequired, async (request, response) => {
    try {
        const result = await run("UPDATE checkout_orders SET status = 'paid' WHERE order_no = ? AND user_id = ? AND status = 'pending'", [request.params.orderNo, request.user.userId]);
        if (!result.changes) return response.status(404).json({ message: '待支付订单不存在或已处理' });
        await logOperation(request.user.userId, 'checkout_order_pay', request.params.orderNo);
        response.json({ status: 'paid', message: '订单已支付' });
    } catch (error) {
        response.status(500).json({ message: '支付状态更新失败' });
    }
});

function requireBodyFields(body, fields) {
    return fields.find(field => typeof body[field] !== 'string' || !body[field].trim());
}

app.post('/api/user/register', async (request, response) => {
    try {
        const missing = requireBodyFields(request.body, ['username', 'password']);
        if (missing) return response.status(400).json({ message: `缺少${missing}字段` });
        const { username, password, company = '未填写' } = request.body;
        if (!/^[A-Za-z0-9_]{3,20}$/.test(username) || password.length < 6) {
            return response.status(400).json({ message: '账号或密码格式不正确' });
        }
        const passwordHash = await bcrypt.hash(password, 12);
        const result = await run('INSERT INTO users (username, password, company, create_time) VALUES (?, ?, ?, datetime(\'now\'))', [username, passwordHash, company.trim() || '未填写']);
        const user = { id: result.id, username, company: company.trim() || '未填写' };
        await logOperation(result.id, 'register', '用户注册');
        response.status(201).json({ user, token: createToken(user) });
    } catch (error) {
        response.status(error.message.includes('UNIQUE') ? 409 : 500).json({ message: error.message.includes('UNIQUE') ? '账号已存在' : '注册失败' });
    }
});

app.post('/api/user/login', async (request, response) => {
    try {
        const missing = requireBodyFields(request.body, ['username', 'password']);
        if (missing) return response.status(400).json({ message: `缺少${missing}字段` });
        const user = await get('SELECT id, username, password, company FROM users WHERE username = ?', [request.body.username]);
        const isDemo = request.body.username === 'admin' && request.body.password === '123456';
        let loginUser = user;
        if (!user && isDemo) {
            const passwordHash = await bcrypt.hash('123456', 12);
            const created = await run('INSERT INTO users (username, password, company, create_time) VALUES (?, ?, ?, datetime(\'now\'))', ['admin', passwordHash, '励尚时代公关']);
            loginUser = { id: created.id, username: 'admin', password: passwordHash, company: '励尚时代公关' };
        }
        if (!loginUser || !(await bcrypt.compare(request.body.password, loginUser.password))) {
            return response.status(401).json({ message: '账号或密码错误' });
        }
        const safeUser = { id: loginUser.id, username: loginUser.username, company: loginUser.company };
        await logOperation(safeUser.id, 'login', '用户登录');
        response.json({ user: safeUser, token: createToken(safeUser) });
    } catch (error) {
        response.status(500).json({ message: '登录失败' });
    }
});

app.post('/api/demand/analyze', async (request, response) => {
    try {
        const missing = requireBodyFields(request.body, ['input']);
        if (missing) return response.status(400).json({ message: '请输入品牌需求' });
        const input = request.body.input.trim();
        const category = input.includes('数码') || input.includes('科技')
            ? { key: 'tech', label: '科技/数码' }
            : input.includes('美食') || input.includes('餐饮')
                ? { key: 'food', label: '美食/餐饮' }
                : input.includes('时尚') || input.includes('穿搭')
                    ? { key: 'fashion', label: '时尚/穿搭' }
                    : input.includes('生活') || input.includes('家居')
                        ? { key: 'lifestyle', label: '生活方式' }
                        : { key: 'beauty', label: '美妆/护肤' };
        const audience = input.includes('职场')
            ? { key: 'young-professional', label: '年轻职场人群' }
            : input.includes('Z世代') || input.includes('年轻人')
                ? { key: 'genz', label: 'Z世代' }
                : { key: 'college', label: '18-22岁大学生' };
        const quantityMatch = input.match(/(\d+)\s*(?:个|名|位)/);
        const budgetMatch = input.match(/预算\s*([\d.]+\s*(?:万|万元|元)?)/);
        const result = {
            input,
            category: category.key,
            vertical: category.label,
            audience: audience.key,
            targetAudience: audience.label,
            bloggerLevel: '腰部KOC',
            contentStyle: input.includes('测评') ? '专业测评' : '真实种草',
            budget: budgetMatch ? budgetMatch[1].replace(/\s+/g, '') : '2万元',
            quantity: quantityMatch ? `${quantityMatch[1]}个` : '100个',
            compliance: '低风险 - 未发现明显合规问题'
        };
        await logOperation(request.user?.userId, 'demand_analyze', input.slice(0, 100));
        response.json({ result });
    } catch (error) {
        response.status(500).json({ message: '需求解析失败' });
    }
});

app.post('/api/koc/match', async (request, response) => {
    try {
        const { category = 'beauty', audience = 'college', quantity = 30, minFollowers, minEngagement, maxRisk, sort = 'score' } = request.body;
        const categoryLabels = { beauty: '美妆,护肤', fashion: '时尚,穿搭', food: '美食,餐饮', tech: '科技,数码', lifestyle: '生活,生活方式' };
        const categoryLabel = categoryLabels[category] || categoryLabels.beauty;
        const conditions = [];
        const parameters = [];
        conditions.push('categories = ?');
        parameters.push(categoryLabel);
        if (audienceProfiles.some(profile => profile.key === audience)) {
            conditions.push('audience = ?');
            parameters.push(audience);
        }
        if (minFollowers !== '' && Number.isFinite(Number(minFollowers))) { conditions.push('follower_count >= ?'); parameters.push(Number(minFollowers)); }
        if (minEngagement !== '' && Number.isFinite(Number(minEngagement))) { conditions.push('engagement_rate >= ?'); parameters.push(Number(minEngagement)); }
        if (maxRisk !== '' && Number.isFinite(Number(maxRisk))) { conditions.push('risk_score * 100 <= ?'); parameters.push(Number(maxRisk)); }
        const rows = await all(`SELECT * FROM koc_info WHERE ${conditions.join(' AND ')}`, parameters);
        const kocs = rows.map(row => ({
            id: row.id, name: row.name, university: row.university, followerCount: row.follower_count,
            engagementRate: row.engagement_rate, conversionRate: row.conversion_rate, contentStyle: row.content_style,
            categories: row.categories.split(','), pastBrands: row.past_brands.split(','), riskScore: row.risk_score,
            performanceData: { exposure: Math.round(row.follower_count * 2.4), engagement: Math.round(row.follower_count * row.engagement_rate / 100), conversion: Math.round(row.follower_count * row.conversion_rate / 100) }
        }));
        const sorters = {
            score: (a, b) => (b.engagementRate + b.conversionRate - b.riskScore * 10) - (a.engagementRate + a.conversionRate - a.riskScore * 10),
            engagement: (a, b) => b.engagementRate - a.engagementRate,
            conversion: (a, b) => b.conversionRate - a.conversionRate,
            followers: (a, b) => b.followerCount - a.followerCount,
            risk: (a, b) => a.riskScore - b.riskScore
        };
        kocs.sort(sorters[sort] || sorters.score);
        const result = kocs.slice(0, Math.max(1, Math.min(Number(quantity) || 30, 100)));
        await logOperation(request.user?.userId, 'koc_match', JSON.stringify({ category, audience, quantity }));
        response.json({ result });
    } catch (error) {
        response.status(500).json({ message: 'KOC匹配失败' });
    }
});

app.post('/api/schedule/generate', authRequired, async (request, response) => {
    try {
        const { start, end, themeCount = 5, kocIds = [] } = request.body;
        if (!start || !end || new Date(start) > new Date(end)) return response.status(400).json({ message: '排期日期不正确' });
        if (!Array.isArray(kocIds) || !kocIds.length || kocIds.length > 100) return response.status(400).json({ message: '请先完成KOC匹配' });
        const matchedRows = await all(`SELECT id, name, follower_count, engagement_rate, conversion_rate FROM koc_info WHERE id IN (${kocIds.map(() => '?').join(',')}) ORDER BY id`, kocIds);
        if (matchedRows.length !== kocIds.length) return response.status(400).json({ message: '匹配的KOC数据已变化，请重新匹配' });
        const themes = ['产品开箱', '使用体验', '效果对比', '日常妆容', 'Q&A解答'];
        const times = ['12:00', '18:00', '20:00', '19:00', '13:00'];
        const startDate = new Date(`${start}T00:00:00`);
        const endDate = new Date(`${end}T00:00:00`);
        const daysAvailable = Math.floor((endDate - startDate) / 86400000) + 1;
        const rowCount = Math.min(Number(themeCount) || 5, daysAvailable, 10);
        const formatDate = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
        const rows = Array.from({ length: rowCount }, (_, index) => {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + index);
            const rowKOCs = matchedRows.filter((_, kocIndex) => kocIndex % rowCount === index);
            const exposure = rowKOCs.reduce((total, koc) => total + Math.round(koc.follower_count * 2.4), 0);
            return { date: formatDate(date), time: times[index % times.length], theme: themes[index % themes.length], kocs: rowKOCs.map(koc => koc.name).join(', ') || matchedRows[index % matchedRows.length].name, exposure: exposure.toLocaleString() };
        });
        const result = {
            start, end, themeCount: rowCount, kocIds, overview: { exposure: rows.reduce((total, row) => total + Number(row.exposure.replace(/,/g, '')), 0).toLocaleString(), engagement: `${(matchedRows.reduce((total, koc) => total + koc.engagement_rate, 0) / matchedRows.length).toFixed(1)}%`, conversion: `${(matchedRows.reduce((total, koc) => total + koc.conversion_rate, 0) / matchedRows.length).toFixed(1)}%`, cost: `¥${(matchedRows.length * 280 + 2000).toLocaleString()}` }, rows,
            brief: { title: '投放简报', theme: '匹配KOC内容投放', audience: '基于当前匹配结果', platform: '校园KOC社交媒体', quantity: `${matchedRows.length}个校园KOC`, strategy: '以真实种草为主，强调产品效果和使用体验' }
        };
        await logOperation(request.user.userId, 'schedule_generate', JSON.stringify({ start, end }));
        response.json({ result });
    } catch (error) {
        response.status(500).json({ message: '排期生成失败' });
    }
});

app.post('/api/compliance/check', async (request, response) => {
    try {
        const missing = requireBodyFields(request.body, ['input']);
        if (missing) return response.status(400).json({ message: '请输入待审查文案' });
        const fixedWords = ['最佳', '最有效', '第一', '顶级', '100%', '纯天然', '无副作用', '特效', '神奇', '永久', '彻底', '根治', '治疗', '药用', '医学', '医院', '医生推荐', '临床试验', '权威认证', '治愈', '疗效', '医生', '临床', '病理', '症状', '疾病', '健康', '养生', '保健'];
        const customWords = Array.isArray(request.body.customWords) ? request.body.customWords.filter(word => typeof word === 'string' && word.trim()) : [];
        const riskWords = [...new Set([...fixedWords, ...customWords])].filter(word => request.body.input.includes(word)).sort((a, b) => b.length - a.length);
        const results = request.body.input.split(/\r?\n/).map(text => {
            const lineRiskWords = riskWords.filter(word => text.includes(word));
            return { input: text, riskWords: lineRiskWords, replacedText: lineRiskWords.reduce((value, word) => value.split(word).join('***'), text) };
        });
        const result = { total: results.length, highRiskCount: results.filter(item => item.riskWords.length).length, riskWords, results };
        await run('INSERT INTO compliance_records (user_id, input_text, risk_result, create_time) VALUES (?, ?, ?, datetime(\'now\'))', [request.user?.userId || null, request.body.input, JSON.stringify(result)]);
        await logOperation(request.user?.userId, 'compliance_check', `${results.length}条文案`);
        response.json({ result });
    } catch (error) {
        response.status(500).json({ message: '合规审查失败' });
    }
});

app.get('/api/project/list', authRequired, async (request, response) => {
    try {
        const projects = await all('SELECT id, project_name AS projectName, demand_content AS demandContent, koc_result AS kocResult, schedule_data AS scheduleData, create_time AS createTime FROM projects WHERE user_id = ? ORDER BY create_time DESC', [request.user.userId]);
        response.json({ projects: projects.map(project => ({ ...project, demandContent: project.demandContent ? JSON.parse(project.demandContent) : null, kocResult: project.kocResult ? JSON.parse(project.kocResult) : null, scheduleData: project.scheduleData ? JSON.parse(project.scheduleData) : null })) });
    } catch (error) {
        response.status(500).json({ message: '历史项目获取失败' });
    }
});

app.post('/api/project/save', authRequired, async (request, response) => {
    try {
        const { id, projectName = '未命名项目', demandContent, kocResult, scheduleData } = request.body;
        if (id) {
            const ownedProject = await get('SELECT id FROM projects WHERE id = ? AND user_id = ?', [id, request.user.userId]);
            if (!ownedProject) return response.status(404).json({ message: '项目不存在' });
            await run(`UPDATE projects SET project_name = ?, demand_content = ?, koc_result = ?, schedule_data = ?, create_time = datetime('now') WHERE id = ? AND user_id = ?`, [projectName, JSON.stringify(demandContent || null), JSON.stringify(kocResult || null), JSON.stringify(scheduleData || null), id, request.user.userId]);
            await logOperation(request.user.userId, 'project_update', projectName);
            return response.json({ id, message: '项目已更新' });
        }
        const result = await run(`INSERT INTO projects (user_id, project_name, demand_content, koc_result, schedule_data, create_time) VALUES (?, ?, ?, ?, ?, datetime('now'))`, [request.user.userId, projectName, JSON.stringify(demandContent || null), JSON.stringify(kocResult || null), JSON.stringify(scheduleData || null)]);
        await logOperation(request.user.userId, 'project_save', projectName);
        response.status(201).json({ id: result.id, message: '项目已保存' });
    } catch (error) {
        response.status(500).json({ message: '项目保存失败' });
    }
});

app.delete('/api/project/:id', authRequired, async (request, response) => {
    try {
        const result = await run('DELETE FROM projects WHERE id = ? AND user_id = ?', [request.params.id, request.user.userId]);
        if (!result.changes) return response.status(404).json({ message: '项目不存在' });
        await logOperation(request.user.userId, 'project_delete', request.params.id);
        response.json({ message: '项目已删除' });
    } catch (error) {
        response.status(500).json({ message: '项目删除失败' });
    }
});

app.get('/api/user/me', authRequired, async (request, response) => {
    const user = await get('SELECT id, username, company FROM users WHERE id = ?', [request.user.userId]);
    if (!user) return response.status(404).json({ message: '用户不存在' });
    response.json({ user });
});

// 404 兜底：未匹配的接口返回统一 JSON，避免前端拿到 HTML 报错页
app.use((request, response) => {
    response.status(404).json({ message: `接口不存在：${request.method} ${request.path}` });
});

// 全局错误处理中间件：兜底路由中未捕获的同步/异步异常，防止进程崩溃
app.use((error, request, response, next) => {
    console.error('Unhandled server error:', error);
    if (response.headersSent) return next(error);
    response.status(500).json({ message: '服务器内部错误，请稍后重试' });
});

// 进程级保护：单个异步异常不应导致整个后端退出
process.on('uncaughtException', error => {
    console.error('[uncaughtException]', error);
});
process.on('unhandledRejection', reason => {
    console.error('[unhandledRejection]', reason);
});

initializeDatabase().then(() => {
    const server = app.listen(port, '127.0.0.1', () => {
        console.log(`Lishang server listening at http://127.0.0.1:${port}`);
        console.log(`前端页面请访问 http://127.0.0.1:${port}/ ，不要用 file:// 直接打开 index.html`);
    });
    server.on('error', error => {
        if (error.code === 'EADDRINUSE') {
            console.error(`端口 ${port} 已被占用：请关闭占用程序，或修改 server.js 顶部的 port 后重试`);
        } else {
            console.error('服务器启动失败：', error);
        }
        process.exit(1);
    });
}).catch(error => {
    console.error('Database initialization failed', error);
    process.exit(1);
});
