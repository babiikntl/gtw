const fs = require('fs');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const TelegramBot = require('node-telegram-bot-api');
const { execSync } = require('child_process');
const FormData = require('form-data');
const yts = require('yt-search');
const os = require('os');
const { performance } = require('perf_hooks');
const { igdl, youtube, ttdl } = require('btch-downloader');
const moment = require('moment');

// Konfigurasi
const CONFIG_PATH = './config.json';
const DEFAULT_CONFIG = {
  NAMABOT: 'FikXzDatabase',
  VERSIBOTZ: '3.0.0',
  DEVELOPER: 't.me/@FikXzModzz',
  BOT_TOKEN: "YOUR_BOT_TOKEN",
  GITHUB_PAT: "YOUR_GITHUB_TOKEN",
  GITHUB_REPO: "user/repo_name",
  INITIAL_OWNER: 123456789,
  USER_LIMIT: {
    NUMBERS_PER_PERIOD: 3,
    PERIOD_DAYS: 14
  }
};

// File paths
const DATA_PATH = './data';
const OWNER_FILE = path.join(DATA_PATH, 'owners.json');
const RESELLER_FILE = path.join(DATA_PATH, 'resellers.json');
const USER_FILE = path.join(DATA_PATH, 'users.json');
const NUMBER_ADD_LOG = path.join(DATA_PATH, 'number_add_logs.json');
const ERROR_LOG = path.join(DATA_PATH, 'error.log');
const GITHUB_FILE_PATH = "database.json";

// Pastikan folder data ada
if (!fs.existsSync(DATA_PATH)) {
  fs.mkdirSync(DATA_PATH);
}

// Load config
let config;
try {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    console.log('⚠️ config.json created. Please fill in your credentials!');
    process.exit(0);
  }
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  config = {...DEFAULT_CONFIG, ...config};
  config.INITIAL_OWNER = Number(config.INITIAL_OWNER);
} catch (error) {
  console.error('Config Error:', error);
  process.exit(1);
}

// SIMPLE ACCESS CONTROL SYSTEM
const loadAccessData = () => {
  const owners = fs.existsSync(OWNER_FILE) ? 
    JSON.parse(fs.readFileSync(OWNER_FILE, 'utf8')).owners : 
    [config.INITIAL_OWNER];
  
  const resellers = fs.existsSync(RESELLER_FILE) ? 
    JSON.parse(fs.readFileSync(RESELLER_FILE, 'utf8')).resellers : 
    [];
  
  const users = fs.existsSync(USER_FILE) ? 
    JSON.parse(fs.readFileSync(USER_FILE, 'utf8')).users : 
    [];
  
  return {
    owners: owners.map(Number),
    resellers: resellers.map(Number),
    users: users.map(Number)
  };
};

const ANTILINK_FILE = path.join(DATA_PATH, './antilink.json');

let antilinkGroups = [];
if (fs.existsSync(ANTILINK_FILE)) {
  try {
    antilinkGroups = JSON.parse(fs.readFileSync(ANTILINK_FILE, 'utf8'));
  } catch (error) {
    logError(error, 'loadAntilink');
    antilinkGroups = [];
  }
}

const saveAccessData = (data) => {
  fs.writeFileSync(OWNER_FILE, JSON.stringify({ owners: data.owners }, null, 2));
  fs.writeFileSync(RESELLER_FILE, JSON.stringify({ resellers: data.resellers }, null, 2));
  fs.writeFileSync(USER_FILE, JSON.stringify({ users: data.users }, null, 2));
};

// Helper fungsi
const formatp = (size) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(2)} ${units[i]}`;
};

const runtime = (seconds) => {
  seconds = Number(seconds);
  const d = Math.floor(seconds / (3600*24));
  const h = Math.floor(seconds % (3600*24) / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
};

// Helper functions
const logError = (error, context = '') => {
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  const logMessage = `[${timestamp}] ${context}: ${error.stack || error}\n`;
  console.error(logMessage);
  fs.appendFileSync(ERROR_LOG, logMessage);
};

// GitHub operations
const fetchNumbers = async () => {
  try {
    const url = `https://raw.githubusercontent.com/${config.GITHUB_REPO}/main/${GITHUB_FILE_PATH}?_=${Date.now()}`;
    const response = await axios.get(url, {
      headers: { 'Authorization': `token ${config.GITHUB_PAT}` },
      timeout: 10000
    });
    return response.data?.data || [];
  } catch (error) {
    logError(error, 'fetchNumbers');
    return [];
  }
};

// Save antilink data
const saveAntilinkData = () => {
  fs.writeFileSync(ANTILINK_FILE, JSON.stringify(antilinkGroups, null, 2));
};

const updateNumbers = async (newNumbers) => {
  try {
    const apiUrl = `https://api.github.com/repos/${config.GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;
    
    // Get current file SHA
    const { data } = await axios.get(apiUrl, {
      headers: { 'Authorization': `token ${config.GITHUB_PAT}` }
    });

    const updatedContent = Buffer.from(
      JSON.stringify({ data: newNumbers }, null, 2)
    ).toString('base64');

    await axios.put(apiUrl, {
      message: "Update number list",
      content: updatedContent,
      sha: data.sha,
    }, {
      headers: { 'Authorization': `token ${config.GITHUB_PAT}` }
    });

    return true;
  } catch (error) {
    logError(error, 'updateNumbers');
    return false;
  }
};

// Inisialisasi bot
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
const MENU_IMAGE = "https://files.catbox.moe/nu1837.png";

// Akses control functions
const isOwner = (userId) => {
  const data = loadAccessData();
  return data.owners.includes(Number(userId));
};

const isReseller = (userId) => {
  const data = loadAccessData();
  return data.resellers.includes(Number(userId));
};

const isUser = (userId) => {
  const data = loadAccessData();
  return data.users.includes(Number(userId));
};

const hasAccess = (userId) => {
  return isOwner(userId) || isReseller(userId) || isUser(userId);
};

// User number limit system
const canAddNumber = (userId) => {
  if (isOwner(userId) || isReseller(userId)) return true;
  
  if (!isUser(userId)) return false;
  
  try {
    const logData = fs.existsSync(NUMBER_ADD_LOG) ? 
      JSON.parse(fs.readFileSync(NUMBER_ADD_LOG, 'utf8')) : 
      { logs: [] };
    
    const periodStart = moment().subtract(config.USER_LIMIT.PERIOD_DAYS, 'days');
    const userLogs = logData.logs.filter(log => 
      log.userId === userId && moment(log.timestamp).isAfter(periodStart)
    );
    
    return userLogs.length < config.USER_LIMIT.NUMBERS_PER_PERIOD;
  } catch (error) {
    logError(error, 'canAddNumber');
    return false;
  }
};

const logNumberAdd = (userId, number) => {
  try {
    const logData = fs.existsSync(NUMBER_ADD_LOG) ? 
      JSON.parse(fs.readFileSync(NUMBER_ADD_LOG, 'utf8')) : 
      { logs: [] };
    
    logData.logs.push({
      userId: Number(userId),
      number,
      timestamp: moment().toISOString()
    });
    
    fs.writeFileSync(NUMBER_ADD_LOG, JSON.stringify(logData, null, 2));
  } catch (error) {
    logError(error, 'logNumberAdd');
  }
};

const emde = MENU_IMAGE;
const Emdemenu = `
┏━━〘 𝗗𝗔𝗧𝗔𝗕𝗔𝗦𝗘 𝗕𝗢𝗧 〙
┃▢ Nama Bot: ${config.NAMABOT}
┃▢ Versi: ${config.VERSIBOTZ}
┃▢ TypeScrip: JawaScript
┃▢ Developer : ${config.DEVELOPER}
┗━━━━━━━━━━━━━━━━━━━

┏━━〔 𝗠𝗗 𝗠𝗲𝗻𝘂 〕
╿✰ /play [query] - Play musik dari YouTube
╿✰ /buatcase [promt] - Generate kode fitur bot
╿✰ /chtml [promt] - Generate kode HTML
╿✰ /nulis [teks] - Buat gambar tulisan tangan
╿✰ /dongeng - Cerita dongeng random
╿✰ /tt [link] - Download video TikTok
╿✰ /fb [link] - Download video Facebook
╿✰ /ig [link] - Download media Instagram
╿✰ /deploybtwo [Subdomain] - Index/deploy Web
╿✰ /galauvid - Video galau random
╿✰ /cuaca [kota] - Info cuaca + suara
╿✰ /infogempa - Info gempa terkini
╿✰ /ssweb [url] - Screenshot website
╿✰ /saveweb [url] - Simpan website ke ZIP
╿✰ /shorturl [url] - Pendekkan URL
╿✰ /pin [query] - Cari gambar di Pinterest
╿✰ /tts [teks] - Ubah teks menjadi suara
╿✰ /tourl - Convert file ke URL (reply file)
╿✰ /feedback [pesan] - Kirim masukan ke owner
┗━━━━━━━━━━━━━━━━━━━
`.trim();

// Command: /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
    if (!hasAccess(userId)) {
  return bot.sendMessage(
    chatId,
    `❌ Akses ditolak, Anda tidak memiliki akses!\n` +
    `Silakan hubungi owner untuk mendapatkan akses.\n` +
    `Anda sekarang hanya bisa akses /mdmenu.`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📂 Menu MD', callback_data: 'menuemdekontol' }
          ]
        ]
      }
    }
  );
}
  
  let menuText = '';
  
  if (isOwner(userId)) {
    menuText = `
┏━━〘 𝗗𝗔𝗧𝗔𝗕𝗔𝗦𝗘 𝗕𝗢𝗧 〙
┃▢ Nama Bot: ${config.NAMABOT}
┃▢ Versi: ${config.VERSIBOTZ}
┃▢ TypeScrip: JawaScript
┃▢ Developer : ${config.DEVELOPER}
┃▢ Status: Owners
┗━━━━━━━━━━━━━━━━━━━

┏━━〔 𝗗𝗮𝘁𝗮𝗯𝗮𝘀𝗲 𝗠𝗲𝗻𝘂 〕
╿✰ /addnumber [62xxx] - Tambah nomor
╿✰ /delnumber [62xxx] - Hapus nomor
╿✰ /listnumber - Lihat semua nomor
┗━━━━━━━━━━━━━━━━━━━

┏━━〔 𝗨𝘀𝗲𝗿 𝗠𝗲𝗻𝘂 〕
╿✰ /adduser [id] - Tambah user
╿✰ /deluser [id] - Hapus user
╿✰ /listuser - Lihat user
┗━━━━━━━━━━━━━━━━━━━

┏━━〔 𝗥𝗲𝘀𝗲𝗹𝗹𝗲𝗿 𝗠𝗲𝗻𝘂 〕
╿✰ /addreseller [id] - Tambah reseller
╿✰ /delreseller [id] - Hapus reseller
╿✰ /listreseller - Lihat reseller
┗━━━━━━━━━━━━━━━━━━━

┏━━〔 𝗢𝘄𝗻𝗲𝗿 𝗠𝗲𝗻𝘂 〕
╿✰ /addowner [id] - Tambah owner
╿✰ /delowner [id] - Hapus owner
╿✰ /listowner - Lihat owner
╿✰ /log - Dapatkan log error
┗━━━━━━━━━━━━━━━━━━━

┏━━〔 𝗜𝗻𝗳𝗼 〕
╿✰ /ping - Cek status bot
┗━━━━━━━━━━━━━━━━━━━

Note: Untuk Menu User, Reseller, Owner
Berbeda-Beda ya pak cik..

┏━━〔 THANK/TQTO 〕
╿✰ FikXzModsTzyy > developed
╿✰ Orang Tua Aing
╿✰ Shafira > My Love
╿✰ GalangHost > Frind Dajjal
┗━━━━━━━━━━━━━━━━━━━
    `.trim();
  } else if (isReseller(userId)) {
    menuText = `
┏━━〘 𝗗𝗔𝗧𝗔𝗕𝗔𝗦𝗘 𝗕𝗢𝗧 〙
┃▢ Nama Bot: ${config.NAMABOT}
┃▢ Versi: ${config.VERSIBOTZ}
┃▢ TypeScrip: JawaScript
┃▢ Developer : ${config.DEVELOPER}
┃▢ Status: Resellers
┗━━━━━━━━━━━━━━━━━━━

┏━━〔 𝗡𝗼𝗺𝗼𝗿 𝗠𝗲𝗻𝘂 〕
╿✰ /addnumber [62xxx] - Tambah nomor
╿✰ /delnumber [62xxx] - Hapus nomor
╿✰ /listnumber - Lihat semua nomor
┗━━━━━━━━━━━━━━━━━━━

┏━━〔 𝗨𝘀𝗲𝗿 𝗠𝗲𝗻𝘂 〕
╿✰ /adduser [id] - Tambah user
╿✰ /deluser [id] - Hapus user
╿✰ /listuser - Lihat user
┗━━━━━━━━━━━━━━━━━━━

┏━━〔 𝗜𝗻𝗳𝗼 〕
╿✰ /ping - Cek status bot
┗━━━━━━━━━━━━━━━━━━━

Note: Untuk Menu User, Reseller, Owner
Berbeda-Beda ya pak cik..

┏━━〔 THANK/TQTO 〕
╿✰ FikXzModsTzyy > developed
╿✰ Orang Tua Aing
╿✰ Shafira > My Love
╿✰ GalangHost > Frind Dajjal
┗━━━━━━━━━━━━━━━━━━━
    `.trim();
  } else if (isUser(userId)) {
    menuText = `
┏━━〘 𝗗𝗔𝗧𝗔𝗕𝗔𝗦𝗘 𝗕𝗢𝗧 〙
┃▢ Nama Bot: ${config.NAMABOT}
┃▢ Versi: ${config.VERSIBOTZ}
┃▢ TypeScrip: JawaScript
┃▢ Developer : ${config.DEVELOPER}
┃▢ Status: Users
┗━━━━━━━━━━━━━━━━━━━

┏━━〔 𝗡𝗼𝗺𝗼𝗿 𝗠𝗲𝗻𝘂 〕
╿✰ /addnumber [62xxx] - Tambah nomor
┗━━━━━━━━━━━━━━━━━━━

┏━━〔 𝗜𝗻𝗳𝗼 〕
╿✰ /myquota - Cek kuota saya
╿✰ /ping - Cek status bot
┗━━━━━━━━━━━━━━━━━━━

Note: Untuk Menu User, Reseller, Owner
Berbeda-Beda ya pak cik..

┏━━〔 THANK/TQTO 〕
╿✰ FikXzModsTzyy > developed
╿✰ Orang Tua Aing
╿✰ Shafira > My Love
╿✰ GalangHost > Frind Dajjal
┗━━━━━━━━━━━━━━━━━━━
    `.trim();
  }
  
  bot.sendPhoto(chatId, MENU_IMAGE, {
  caption : menuText,
  parse_mode : 'Markdown',
  reply_markup : {
    inline_keyboard : [
      [{ text: '📂 Menu MD', callback_data: 'menuemdekontol' }]
    ]
  }
});
}); 

// ─── tombol inline "Menu MD" ──────────────────────────────────────────
bot.on('callback_query', async q => {
  if (q.data !== 'menuemdekontol') return;     
  const userId = q.from.id;

  try {
    await bot.sendPhoto(q.message.chat.id, emde, {
      caption: Emdemenu,
      parse_mode: 'Markdown'
    });
    await bot.answerCallbackQuery(q.id);  
  } catch (e) {
    logError(e, 'callback menuemdekontol');
    bot.answerCallbackQuery(q.id, { text: 'Gagal kirim Menu MD', show_alert: true });
  }
});

bot.onText(/\/mdmenu/i, (msg) => {
  bot.sendPhoto(msg.chat.id, emde, {
    caption : Emdemenu,
    parse_mode : 'Markdown'
  });
});

// Command: /ping
bot.onText(/\/ping/, (msg) => {
  const chatId = msg.chat.id;

  const used = process.memoryUsage();
  const cpus = os.cpus().map(cpu => {
    cpu.total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return cpu;
  });

  const cpu = cpus.reduce((acc, cpu, _, { length }) => {
    acc.total += cpu.total;
    acc.speed += cpu.speed / length;
    for (let type in cpu.times) {
      acc.times[type] = (acc.times[type] || 0) + cpu.times[type];
    }
    return acc;
  }, {
    speed: 0,
    total: 0,
    times: {}
  });

  const t0 = performance.now();
  const t1 = performance.now();
  const latency = (t1 - t0).toFixed(2);

  const memUsed = formatp(os.totalmem() - os.freemem());
  const memTotal = formatp(os.totalmem());

  let message = `*📡 BOT STATUS*\n`;
  message += `• *Speed:* ${latency} ms\n`;
  message += `• *Uptime:* ${runtime(process.uptime())}\n\n`;

  message += `*🧠 Memory:*\n`;
  Object.keys(used).forEach(k => {
    message += `> ${k}: ${formatp(used[k])}\n`;
  });

  message += `\n*💻 CPU:* ${cpus[0].model.trim()} (${cpu.speed} MHz)\n`;
  Object.entries(cpu.times).forEach(([type, time]) => {
    const percent = ((100 * time) / cpu.total).toFixed(2);
    message += `> ${type}: ${percent}%\n`;
  });

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

bot.onText(/\/runtime/, (msg) => {
  const chatId = msg.chat.id;
  const uptime = runtime(process.uptime());
  bot.sendMessage(chatId, `🤖 *${config.NAMABOT}* aktif selama: *${uptime}*`, {
    parse_mode: 'Markdown'
  });
});

// Command: /myquota
bot.onText(/\/myquota/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isUser(userId)) {
    return bot.sendMessage(chatId, '❌ Hanya user biasa yang memiliki kuota!');
  }
  
  try {
    const logData = fs.existsSync(NUMBER_ADD_LOG) ? 
      JSON.parse(fs.readFileSync(NUMBER_ADD_LOG, 'utf8')) : 
      { logs: [] };
    
    const periodStart = moment().subtract(config.USER_LIMIT.PERIOD_DAYS, 'days');
    const userLogs = logData.logs.filter(log => 
      log.userId === userId && moment(log.timestamp).isAfter(periodStart)
    );
    
    const remaining = config.USER_LIMIT.NUMBERS_PER_PERIOD - userLogs.length;
    const resetDate = moment().add(config.USER_LIMIT.PERIOD_DAYS - userLogs.length, 'days').format('DD/MM/YYYY');
    
    bot.sendMessage(
      chatId,
      `📊 Kuota Penambahan Nomor Anda:\n` +
      `✳️ Digunakan: ${userLogs.length}/${config.USER_LIMIT.NUMBERS_PER_PERIOD}\n` +
      `✳️ Tersisa: ${remaining}\n` +
      `♻️ Reset pada: ${resetDate}`
    );
  } catch (error) {
    logError(error, '/myquota');
    bot.sendMessage(chatId, '⚠️ Gagal memeriksa kuota');
  }
});

// Command: /addnumber
bot.onText(/^\/addnumber(?:\s+(\S+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const newNumber = (match[1] || '').trim(); 
  
  if (!newNumber) {
    return bot.sendMessage(chatId, 'Contoh penggunaan:\n/addnumber 62xx');
  }  
  
  // Cek akses
  if (!hasAccess(userId)) {
    return bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
  }
  
  // Cek kuota untuk user biasa
  if (isUser(userId) && !canAddNumber(userId)) {
    return bot.sendMessage(
      chatId,
      `❌ Anda telah mencapai batas penambahan nomor (${config.USER_LIMIT.NUMBERS_PER_PERIOD} per ${config.USER_LIMIT.PERIOD_DAYS} hari)!\n` +
      `Gunakan /myquota untuk melihat detail kuota.`
    );
  }
  
  // Validasi format nomor
  if (!/^\+?\d{8,16}$/.test(newNumber)) {
   return bot.sendMessage(
      chatId,
      '❌ Format nomor tidak valid!\n' +
      '• Harus diawali 62\n' +
      '• Panjang 11-14 digit\n' +
      'Contoh: 6281234567890'
    );
  }
  
  // Proses penambahan nomor
  try {
    const numbers = await fetchNumbers();
    
    if (numbers.includes(newNumber)) {
      return bot.sendMessage(chatId, '⚠️ Nomor sudah ada di database!');
    }
    
    numbers.push(newNumber);
    const success = await updateNumbers(numbers);
    
    if (success) {
      // Log untuk user biasa
      if (isUser(userId)) {
        logNumberAdd(userId, newNumber);
      }
      
      bot.sendMessage(chatId, `✅ Nomor berhasil ditambahkan: ${newNumber}`);
    } else {
      bot.sendMessage(chatId, '❌ Gagal menambahkan nomor! Silakan coba lagi nanti');
    }
  } catch (error) {
    logError(error, '/addnumber');
    bot.sendMessage(chatId, '⚠️ Terjadi kesalahan sistem. Silakan coba lagi nanti');
  }
});

// Command: /delnumber
bot.onText(/\/delnumber (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const delNumber = match[1].trim();
  
  if (!isOwner(userId) && !isReseller(userId)) {
    return bot.sendMessage(chatId, '❌ Hanya owner/reseller yang bisa menghapus nomor!');
  }
  
  try {
    const numbers = await fetchNumbers();
    const index = numbers.indexOf(delNumber);
    
    if (index === -1) {
      return bot.sendMessage(chatId, '⚠️ Nomor tidak ditemukan di database!');
    }
    
    numbers.splice(index, 1);
    const success = await updateNumbers(numbers);
    
    if (success) {
      bot.sendMessage(chatId, `✅ Nomor berhasil dihapus: ${delNumber}`);
    } else {
      bot.sendMessage(chatId, '❌ Gagal menghapus nomor! Silakan coba lagi nanti');
    }
  } catch (error) {
    logError(error, '/delnumber');
    bot.sendMessage(chatId, '⚠️ Terjadi kesalahan sistem. Silakan coba lagi nanti');
  }
});

// Command: /listnumber
bot.onText(/\/listnumber/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!hasAccess(userId)) {
    return bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
  }
  
  try {
    const numbers = await fetchNumbers();
    
    if (numbers.length === 0) {
      return bot.sendMessage(chatId, '📭 Database nomor kosong');
    }
    
    const total = numbers.length;
    const chunkSize = 200;
    let currentChunk = 1;
    
    for (let i = 0; i < numbers.length; i += chunkSize) {
      const chunk = numbers.slice(i, i + chunkSize);
      const message = `📋 Daftar Nomor (${currentChunk}/${Math.ceil(total/chunkSize)})\n` +
                     `Total: ${total} nomor\n\n` +
                     chunk.join('\n');
      
      await bot.sendMessage(chatId, message);
      currentChunk++;
    }
  } catch (error) {
    logError(error, '/listnumber');
    bot.sendMessage(chatId, '⚠️ Gagal mengambil daftar nomor');
  }
});

// Command: /adduser
bot.onText(/\/adduser (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const newUserId = Number(match[1]);
  
  if (!isOwner(userId) && !isReseller(userId)) {
    return bot.sendMessage(chatId, '❌ Hanya owner/reseller yang bisa menambah user!');
  }
  
  const data = loadAccessData();
  
  if (data.users.includes(newUserId)) {
    return bot.sendMessage(chatId, '⚠️ User sudah ada!');
  }
  
  data.users.push(newUserId);
  saveAccessData(data);
  
  bot.sendMessage(chatId, `✅ User berhasil ditambahkan: ${newUserId}`);
  bot.sendMessage(newUserId, `🎉 Anda sekarang memiliki akses sebagai user!\nGunakan /start untuk melihat menu.`);
});

// Command: /deluser
bot.onText(/\/deluser (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const delUserId = Number(match[1]);
  
  if (!isOwner(userId) && !isReseller(userId)) {
    return bot.sendMessage(chatId, '❌ Hanya owner/reseller yang bisa menghapus user!');
  }
  
  const data = loadAccessData();
  const index = data.users.indexOf(delUserId);
  
  if (index === -1) {
    return bot.sendMessage(chatId, '⚠️ User tidak ditemukan!');
  }
  
  data.users.splice(index, 1);
  saveAccessData(data);
  
  bot.sendMessage(chatId, `✅ User berhasil dihapus: ${delUserId}`);
});

// Command: /listuser
bot.onText(/\/listuser/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isOwner(userId) && !isReseller(userId)) {
    return bot.sendMessage(chatId, '❌ Hanya owner/reseller yang bisa melihat daftar user!');
  }
  
  const data = loadAccessData();
  const users = data.users;
  
  if (users.length === 0) {
    return bot.sendMessage(chatId, '🚫 Tidak ada user!');
  }
  
  const message = `👤 Daftar User (${users.length}):\n${users.map((u, i) => `${i+1}. ${u}`).join('\n')}`;
  bot.sendMessage(chatId, message);
});

// Command: /addreseller
bot.onText(/\/addreseller (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const newResellerId = Number(match[1]);
  
  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, '❌ Hanya owner yang bisa menambah reseller!');
  }
  
  const data = loadAccessData();
  
  if (data.resellers.includes(newResellerId)) {
    return bot.sendMessage(chatId, '⚠️ Reseller sudah ada!');
  }
  
  data.resellers.push(newResellerId);
  saveAccessData(data);
  
  bot.sendMessage(chatId, `✅ Reseller berhasil ditambahkan: ${newResellerId}`);
  bot.sendMessage(newResellerId, `🎉 Anda sekarang menjadi reseller!\nGunakan /start untuk melihat menu baru.`);
});

// Command: /delreseller
bot.onText(/\/delreseller (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const resellerId = Number(match[1]);
  
  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, '❌ Hanya owner yang bisa menghapus reseller!');
  }
  
  const data = loadAccessData();
  const index = data.resellers.indexOf(resellerId);
  
  if (index === -1) {
    return bot.sendMessage(chatId, '⚠️ Reseller tidak ditemukan!');
  }
  
  data.resellers.splice(index, 1);
  saveAccessData(data);
  
  bot.sendMessage(chatId, `✅ Reseller berhasil dihapus: ${resellerId}`);
});

// Command: /listreseller
bot.onText(/\/listreseller/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, '❌ Hanya owner yang bisa melihat daftar reseller!');
  }
  
  const data = loadAccessData();
  const resellers = data.resellers;
  
  if (resellers.length === 0) {
    return bot.sendMessage(chatId, '🚫 Tidak ada reseller!');
  }
  
  const message = `👥 Daftar Reseller (${resellers.length}):\n${resellers.map((r, i) => `${i+1}. ${r}`).join('\n')}`;
  bot.sendMessage(chatId, message);
});

// Command: /addowner
bot.onText(/\/addowner (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const newOwnerId = Number(match[1]);
  
  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, '❌ Hanya owner yang bisa menambah owner!');
  }
  
  const data = loadAccessData();
  
  if (data.owners.includes(newOwnerId)) {
    return bot.sendMessage(chatId, '⚠️ Owner sudah ada!');
  }
  
  data.owners.push(newOwnerId);
  saveAccessData(data);
  
  bot.sendMessage(chatId, `✅ Owner berhasil ditambahkan: ${newOwnerId}`);
  bot.sendMessage(newOwnerId, `🎉 Anda sekarang menjadi owner bot!`);
});

// Command: /delowner
bot.onText(/\/delowner (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const ownerId = Number(match[1]);
  
  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, '❌ Hanya owner yang bisa menghapus owner!');
  }
  
  const data = loadAccessData();
  
  // Prevent self-removal if last owner
  if (data.owners.length <= 1 && data.owners[0] === userId) {
    return bot.sendMessage(chatId, '❌ Tidak bisa menghapus diri sendiri jika anda satu-satunya owner!');
  }
  
  const index = data.owners.indexOf(ownerId);
  if (index === -1) {
    return bot.sendMessage(chatId, '⚠️ Owner tidak ditemukan!');
  }
  
  data.owners.splice(index, 1);
  saveAccessData(data);
  
  bot.sendMessage(chatId, `✅ Owner berhasil dihapus: ${ownerId}`);
});

// Command: /listowner
bot.onText(/\/listowner/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, '❌ Hanya owner yang bisa melihat daftar owner!');
  }
  
  const data = loadAccessData();
  const owners = data.owners;
  
  if (owners.length === 0) {
    return bot.sendMessage(chatId, '🚫 Tidak ada owner!');
  }
  
  const message = `👑 Daftar Owner (${owners.length}):\n${owners.map((o, i) => `${i+1}. ${o}`).join('\n')}`;
  bot.sendMessage(chatId, message);
});

// Command: /log
bot.onText(/\/log/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, '❌ Hanya owner yang bisa melihat log!');
  }
  
  if (fs.existsSync(ERROR_LOG) && fs.statSync(ERROR_LOG).size > 0) {
    bot.sendDocument(chatId, ERROR_LOG);
  } else {
    bot.sendMessage(chatId, '📭 Tidak ada log error yang tersimpan');
  }
});

bot.onText(/^\/galauvid$/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const jsonURL = 'https://raw.githubusercontent.com/FikXzModzDeveloper/CasaVideo/main/galau.json';
    const res = await fetch(jsonURL);
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      return bot.sendMessage(chatId, '⚠️ Video tidak ditemukan.');
    }

    const randomVideo = data[Math.floor(Math.random() * data.length)];
    const namaowner = config?.DEVELOPER || "Unknown Owner"; // fallback if undefined

    await bot.sendVideo(chatId, randomVideo, {
      caption: `📼 Galau Video\n\nFrom: ${namaowner}`
    });

  } catch (err) {
    console.error('/galauvid error:', err);
    bot.sendMessage(chatId, '❌ Gagal mengambil video. Coba lagi nanti.');
  }
});

bot.onText(/^\/(facebook|fb)(?:\s+)?(.+)?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const url = (match[2] || '').trim();

  if (!url) {
    return bot.sendMessage(chatId, 'Contoh:\n/fb https://facebook.com/video...');
  }

  bot.sendMessage(chatId, '📥 Memproses video Facebook...');

  try {
    const apiUrl = `https://api-simplebot.vercel.app/download/facebook?apikey=${global.ApikeyRestApi}&url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(apiUrl);

    if (!data?.status || !data?.result?.media) {
      return bot.sendMessage(chatId, '❌ Gagal mengambil video dari Facebook. Pastikan link valid.');
    }

    await bot.sendVideo(chatId, data.result.media, {
      caption: 'Facebook Download ✅'
    });

  } catch (e) {
    console.error('/facebook error:', e);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengunduh dari Facebook.');
  }
});

bot.onText(/^\/(tiktok|tt)(?:\s+)?(.+)?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const url = (match[2] || '').trim();

  if (!url) {
    return bot.sendMessage(chatId, '📝 Contoh:\n/tiktok https://www.tiktok.com/@user/video/1234567890');
  }

  let processingMsg;
  try {
    // Kirim pesan pemrosesan
    processingMsg = await bot.sendMessage(chatId, '📥 Memproses video TikTok...', {
      reply_to_message_id: msg.message_id
    });

    // Gunakan API yang lebih reliable dengan 2 alternatif
    let apiResponse;
    try {
      // Coba API pertama
      apiResponse = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`, {
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
    } catch (firstError) {
      console.log('API pertama gagal, mencoba alternatif...');
      // Jika API pertama gagal, coba API alternatif
      apiResponse = await axios.get(`https://api.douyin.wtf/api?url=${encodeURIComponent(url)}`, {
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
    }

    const data = apiResponse.data;
    
    // Ekstrak data dari respons berdasarkan API yang digunakan
    let videoUrl, audioUrl, author;
    
    if (data.video?.noWatermark) {
      // Format API tiklydown
      videoUrl = data.video.noWatermark;
      audioUrl = data.music;
      author = data.author?.nickname || 'Unknown Author';
    } else if (data.video_data?.nwm_video_url) {
      // Format API douyin.wtf
      videoUrl = data.video_data.nwm_video_url;
      audioUrl = data.music_data?.play_url || data.music_data?.play;
      author = data.author_data?.unique_id || data.author_data?.nickname || 'Unknown Author';
    } else {
      throw new Error('Format respons API tidak dikenali');
    }

    if (!videoUrl) {
      throw new Error('URL video tidak ditemukan');
    }

    const caption = `🎬 Tiktok Downloader Done`;

    // Kirim video
    await bot.sendVideo(chatId, videoUrl, {
      caption: caption,
      supports_streaming: true,
      reply_to_message_id: msg.message_id
    });

    // Kirim audio jika tersedia
    if (audioUrl) {
      try {
        await bot.sendAudio(chatId, audioUrl, {
          title: 'Audio TikTok',
          performer: author,
          caption: '🔊 Audio TikTok',
          reply_to_message_id: msg.message_id
        });
      } catch (audioError) {
        console.warn('Gagal mengirim audio:', audioError);
      }
    }

  } catch (err) {
    console.error("Error TikTok Downloader:", err);
    
    let errorMessage = '❌ Gagal mengunduh video TikTok.';
    
    if (err.response) {
      // Tangani error HTTP
      if (err.response.status) {
        switch (err.response.status) {
          case 400: errorMessage = '❌ URL TikTok tidak valid'; break;
          case 404: errorMessage = '❌ Video tidak ditemukan'; break;
          case 429: errorMessage = '❌ Terlalu banyak permintaan'; break;
          default: errorMessage = `❌ Error server (${err.response.status})`;
        }
      } else {
        errorMessage = '❌ Error server (tidak ada status)';
      }
    } else if (err.message) {
      errorMessage = `❌ ${err.message}`;
    }
    
    await bot.sendMessage(chatId, errorMessage, {
      reply_to_message_id: msg.message_id
    });
  } finally {
    // Selalu hapus pesan pemrosesan jika ada
    if (processingMsg) {
      try {
        await bot.deleteMessage(chatId, processingMsg.message_id);
      } catch (deleteError) {
        console.warn('Gagal menghapus pesan pemrosesan:', deleteError);
      }
    }
  }
});

bot.onText(/^\/(ig|instagram|instargram)(?:\s+)?(.+)?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const link = (match[2] || '').trim();

  if (!link) {
    return bot.sendMessage(chatId,
      'Contoh:\n/ig https://www.instagram.com/reel/XXXX');
  }

  // Pesan proses
  bot.sendMessage(chatId, '📥 Memproses…');

  try {
    const { data } = await axios.get(
      `https://api.yogik.id/downloader/instagram?url=${encodeURIComponent(link)}`
    );

    if (!data?.status || !data?.result?.media) {
      return bot.sendMessage(chatId,
        '❌ Gagal mengambil. Pastikan link valid.');
    }

    const mediaUrl = data.result.media;

    // Cek tipe (image / video)
    const head = await axios.head(mediaUrl, { timeout: 10000 });
    const type = head.headers['content-type'] || '';

    if (type.startsWith('image/')) {
      await bot.sendPhoto(chatId, mediaUrl,
        { caption: 'Instagram Download ✅' });
    } else {
      await bot.sendVideo(chatId, mediaUrl,
        { caption: 'Instagram Download ✅' });
    }

  } catch (e) {
    console.error('/ig error:', e);
    bot.sendMessage(chatId,
      '❌ Terjadi kesalahan saat mengunduh dari Instagram.');
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  // Deteksi command /tourl dari caption atau text
  const isTourl =
    (msg.caption && msg.caption.toLowerCase().startsWith('/tourl')) ||
    (msg.text && msg.text.toLowerCase() === '/tourl');

  if (!isTourl) return; // kalau bukan /tourl, skip

  // Ambil file dari caption langsung ATAU dari reply
  const target = msg.reply_to_message || msg;
  const file =
    target.document ||
    (target.photo && target.photo[target.photo.length - 1]) ||
    target.video ||
    target.audio;

  if (!file || !file.file_id) {
    return bot.sendMessage(chatId, '❗ Kirim atau reply file dengan /tourl');
  }

  try {
    const fileUrl = await bot.getFileLink(file.file_id);
    const res = await axios.get(fileUrl, { responseType: 'stream' });

    const tmpPath = `./tmpfile_${Date.now()}`;
    const writer = fs.createWriteStream(tmpPath);
    res.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const form = new FormData();
    form.append('file', fs.createReadStream(tmpPath));

    const upload = await axios.post('https://cloudgood.web.id/upload.php', form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    fs.unlinkSync(tmpPath); // bersihkan file lokal

    const url = upload.data?.url;
    if (!url || url === 'Gagal Upload CloudGood') {
      return bot.sendMessage(chatId, '❌ Gagal mengunggah file ke CloudGood.');
    }

    const caption = `𝗙𝗶𝗹𝗲 𝗯𝗲𝗿𝗵𝗮𝘀𝗶𝗹 𝗱𝗶𝘂𝗽𝗹𝗼𝗮𝗱 ✅\n\n🌐 *URL:* ${url}\n🧨 *Expired:* gatau\n\n🛠️ ᴄʀᴇᴀᴛᴇᴅ ʙʏ ғɪᴋxᴢᴍᴏᴅsᴛᴢʏ ⚡`;
    bot.sendMessage(chatId, caption, { reply_to_message_id: messageId });

  } catch (err) {
    console.error('Upload error:', err);
    bot.sendMessage(chatId, `❌ Error: ${err.message}`);
  }
});  

// Command: /play (versi baru dengan API nekorinn)
bot.onText(/^\/play(?:\s+)?(.+)?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = (match[1] || '').trim();

  if (!query) {
    return bot.sendMessage(chatId, 'рҹ“қ Contoh penggunaan:\n/play faded');
  }

  try {
    // Kirim indikator pemrosesan
    const processingMsg = await bot.sendMessage(chatId, '😎Memproses permintaan lagu...', {
      reply_to_message_id: msg.message_id
    });

    const apiUrl = `https://api.nekorinn.my.id/downloader/ytplay-savetube?q=${encodeURIComponent(query)}`;
    const response = await axios.get(apiUrl, { timeout: 15000 });
    const data = response.data;

    if (!data?.status || !data?.result) {
      throw new Error('Gagal mengambil data lagu');
    }

    const meta = data.result.metadata || {};
    const audioUrl = data.result.downloadUrl;

    if (!audioUrl) {
      throw new Error('URL audio tidak tersedia');
    }

    // Format caption
    const caption = `
\`S Y S T E M - P L A Y\`
*Judul:* ${meta.title || 'Tanpa Judul'}
*Channel:* ${meta.channel || 'Tidak diketahui'}
*Durasi:* ${meta.duration || '-'}
*Link:* ${meta.link || '-'}
    `.trim();

    // Hapus pesan pemrosesan
    await bot.deleteMessage(chatId, processingMsg.message_id);

    // Kirim informasi lagu
    await bot.sendMessage(chatId, caption, {
      parse_mode: 'Markdown',
      reply_to_message_id: msg.message_id
    });

    // Kirim audio
    await bot.sendAudio(chatId, audioUrl, {
      title: meta.title || 'Audio',
      performer: meta.channel || 'Unknown Artist',
      caption: 'play music',
      parse_mode: 'Markdown'
    }, {
      filename: `${meta.title || 'audio'}.mp3`,
      mimeType: 'audio/mpeg'
    });

  } catch (err) {
    console.error('Error play command:', err);
    
    // Coba hapus pesan pemrosesan jika ada
    try {
      if (processingMsg) {
        await bot.deleteMessage(chatId, processingMsg.message_id);
      }
    } catch (cleanErr) {
      console.warn('Gagal menghapus pesan pemrosesan:', cleanErr);
    }

    bot.sendMessage(chatId, ' Terjadi kesalahan: ' + (err.message || 'Gagal memproses permintaan'), {
      reply_to_message_id: msg.message_id
    });
  }
});

bot.onText(/\/infogempa/i, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const { data } = await axios.get(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/1.0_day.geojson',
      { timeout: 15000 }
    );

    const quake = data.features?.[0];
    if (!quake) return bot.sendMessage(chatId, '❌ Tidak ada data gempa terkini.');

    const waktu      = moment(quake.properties.time).format('DD/MM/YYYY HH:mm:ss');
    const lokasi     = quake.properties.place ?? '-';
    const magnitudo  = quake.properties.mag   ?? '-';
    const kedalaman  = quake.geometry.coordinates?.[2] ?? '-';
    const koordinat  = quake.geometry.coordinates.slice(0, 2).join(', ');
    const dirasakan  = quake.properties.dmin ?? 'Tidak terdata';

    const teks =
`*Info Gempa Terkini (USGS)*

• Waktu     : ${waktu}
• Lokasi    : ${lokasi}
• Magnitudo : ${magnitudo}
• Kedalaman : ${kedalaman} km
• Koordinat : ${koordinat}
• Dirasakan : ${dirasakan}`;

    await bot.sendMessage(chatId, teks, { parse_mode: 'Markdown' });

  } catch (e) {
    console.error('/infogempa error:', e);
    bot.sendMessage(chatId, `⚠️ Gagal mengambil data gempa: ${e.message}`);
  }
});


/********************************************************************
 * /cuaca <kota>  – data cuaca + TTS
 *******************************************************************/
bot.onText(/^\/cuaca(?:\s+)?(.+)?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const q = (match[1] || '').trim();

  if (!q) {
    return bot.sendMessage(chatId, '📝 Masukkan nama kota.\nContoh: /cuaca Jakarta');
  }

  bot.sendMessage(chatId, '🌤️ Mengambil data cuaca...');

  try {
    const { data } = await axios.get(`https://wttr.in/${encodeURIComponent(q)}?format=j1`, { timeout: 15000 });
    const info = data.current_condition?.[0];
    if (!info) return bot.sendMessage(chatId, '❌ Data cuaca tidak ditemukan.');

    const { temp_C, FeelsLikeC, humidity, windspeedKmph } = info;
    const weather = info.weatherDesc?.[0]?.value;

    const teks =
`🌡️ Cuaca di *${q}*

• Suhu       : ${temp_C}°C (terasa ${FeelsLikeC}°C)
• Cuaca      : ${weather}
• Kelembaban : ${humidity}%
• Angin      : ${windspeedKmph} km/jam`;

    // kirim teks
    await bot.sendMessage(chatId, teks, { parse_mode: 'Markdown' });

    // kirim TTS (voice note)
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=id&q=${encodeURIComponent(teks.replace(/\*/g,''))}`;
    await bot.sendAudio(chatId, ttsUrl, {}, {
      filename: 'cuaca.mp3',
      mimeType: 'audio/mpeg'
    });

  } catch (e) {
    console.error('/cuaca error:', e);
    bot.sendMessage(chatId, '⚠️ Gagal mengambil data cuaca.');
  }
});


bot.onText(/\/dongeng/i, async (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, '📚 Mengambil dongeng acak...');

  try {
    const { data } = await axios.get('https://apizell.web.id/random/dongeng', { timeout: 15000 });
    const judul = data.title ?? 'Dongeng';
    const isi   = data.storyContent ?? 'Tidak ada konten.';

    await bot.sendMessage(chatId, `*${judul}*\n\n${isi}`, { parse_mode: 'Markdown' });

  } catch (e) {
    console.error('/dongeng error:', e);
    bot.sendMessage(chatId, `⚠️ Terjadi kesalahan: ${e.message}`);
  }
});

// Command: /nulis
bot.onText(/\/nulis (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const text = match[1].trim();
  const url = `https://abella.icu/nulis?text=${encodeURIComponent(text)}`;
  
  bot.sendPhoto(chatId, url, {
    caption: '🖋️ Tulisan berhasil dibuat!'
  });
});


bot.onText(/^\/(generatecase|casegen|buatcase)(?:\s+)?(.+)?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const text = (match[2] || '').trim();

  if (!text) return bot.sendMessage(chatId, 'Contoh:\n/generatecase .ping\n/generatecase .gimage pencarian gambar');

  bot.sendMessage(chatId, '🧠 Membuat block kode...');

  try {
    const logic = `Kamu adalah AI pembuat fitur bot WhatsApp menggunakan struktur switch-case CommonJS. Buatlah 1 blok kode fitur berdasarkan perintah user. Jangan berikan tanda kutip, atau teks penjelas apapun. Hanya kode siap tempel.`;

    const url = `https://api.nekorinn.my.id/ai/qwen-turbo-logic?text=${encodeURIComponent(text)}&logic=${encodeURIComponent(logic)}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!json.status || !json.result) return bot.sendMessage(chatId, '❌ Gagal generate case.');

    let rawCode = json.result.trim().replace(/^```[a-z]*\n?|```$/gi, '');

    const tmpDir = './tmp';
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

    const fileName = `case-${Date.now()}.js`;
    const filePath = path.join(tmpDir, fileName);
    fs.writeFileSync(filePath, rawCode);

    await bot.sendDocument(chatId, filePath, {
      filename: fileName,
      caption: `✅ Case Berhasil Dibuat\n\nCommand: *${text}*`,
      parse_mode: 'Markdown'
    });

  } catch (e) {
    console.error('/generatecase error:', e);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat generate case.');
  }
});

bot.onText(/^\/(saveweb|web2zip)(?:\s+)?(.+)?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = (match[2] || '').trim();

  if (!input) return bot.sendMessage(chatId, 'Contoh:\n/saveweb https://example.com');

  bot.sendMessage(chatId, '⏳ Menyimpan website...');

  try {
    const url = input.startsWith('http') ? input : `https://${input}`;
    const { data } = await axios.post('https://copier.saveweb2zip.com/api/copySite', {
      url,
      renameAssets: true
    }, {
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0',
        origin: 'https://saveweb2zip.com'
      }
    });

    const md5 = data.md5;
    let downloadUrl = null;

    while (true) {
      const { data: status } = await axios.get(`https://copier.saveweb2zip.com/api/getStatus/${md5}`);
      if (status.isFinished) {
        downloadUrl = `https://copier.saveweb2zip.com/api/downloadArchive/${md5}`;
        break;
      }
      await new Promise(res => setTimeout(res, 1500));
    }

    await bot.sendDocument(chatId, downloadUrl, {
      filename: `${url.replace(/https?:\/\//, '')}.zip`,
      caption: `✅ Berhasil menyimpan:\n🌐 ${url}`,
      parse_mode: 'Markdown'
    });
  } catch (e) {
    console.error('/saveweb error:', e);
    bot.sendMessage(chatId, `❌ Gagal menyimpan: ${e.message}`);
  }
});

// Command: /shorturl
bot.onText(/^\/shorturl(?:\s+)?(.+)?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const url = (match[1] || '').trim();

  if (!url) {
    return bot.sendMessage(chatId, '❌ Masukkan URL yang ingin di-short!\nContoh: /shorturl https://example.com');
  }

  try {
    bot.sendMessage(chatId, '⏳ Memendekkan URL...');
    
    // Gunakan layanan alternatif yang lebih reliable
    const services = [
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
      `https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`
    ];

    const results = await Promise.allSettled(
      services.map(service => axios.get(service))
    );

    // Format hasil
    const tinyurl = results[0].value.data;
    const isgd = typeof results[1].value.data === 'string' 
      ? JSON.parse(results[1].value.data) 
      : results[1].value.data;

    if (!tinyurl || !isgd.shorturl) {
      return bot.sendMessage(chatId, '❌ Gagal memendekkan URL.');
    }

    const caption = `🔗 *Berhasil dipendekkan:*\n\n` +
                   `1. 🌐 *TinyURL:* ${tinyurl}\n` +
                   `2. 🔗 *is.gd:* ${isgd.shorturl}`;

    bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('ShortURL Error:', err);
    bot.sendMessage(chatId, '❌ Gagal short URL! ' + err.message);
  }
});

// Command: /ssweb
bot.onText(/^\/ssweb(?:\s+)?(.+)?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const url = (match[1] || '').trim();

  if (!url) {
    return bot.sendMessage(chatId, '❌ Masukkan link website!\nContoh: /ssweb https://example.com');
  }

  try {
    bot.sendMessage(chatId, '📸 Mengambil screenshot...');
    const apiUrl = `https://api.fikmydomainsz.xyz/tools/ssweb?url=${encodeURIComponent(url)}`;
    const res = await axios.get(apiUrl);

    if (!res.data || !res.data.result) {
      return bot.sendMessage(chatId, '❌ Gagal mengambil screenshot. Pastikan URL valid.');
    }

    bot.sendPhoto(chatId, res.data.result, {
      caption: '✅ Screenshot Web Berhasil'
    });
  } catch (err) {
    console.error('SSWeb Error:', err);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil screenshot.');
  }
});

bot.onText(/\/backup/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (Number(userId) !== config.INITIAL_OWNER) {
    return bot.sendMessage(chatId, '❌ Fitur ini hanya untuk pemilik utama bot!');
  }
  
  try {
    const tmpDir = './tmp';
    if (fs.existsSync(tmpDir)) {
      const files = fs.readdirSync(tmpDir).filter(f => !f.endsWith('.txt'));
      for (let file of files) {
        try {
          fs.unlinkSync(path.join(tmpDir, file));
        } catch (cleanErr) {
          console.warn('Gagal menghapus file tmp:', cleanErr);
        }
      }
    }

    await bot.sendMessage(chatId, '⏳ Processing Backup Script...');

    const tgl = moment().format('YYYY-MM-DD');
    const jam = moment().format('HH.mm');
    const name = `${config.NAMABOT}-${tgl}#${jam}`;
    
    const exclude = [
      'node_modules', 
      'package-lock.json', 
      'yarn.lock', 
      '.npm', 
      '.cache'
    ];
    
    // Dapatkan semua file/folder kecuali yang dikecualikan
    const filesToZip = fs.readdirSync('.')
      .filter(f => !exclude.includes(f) && f !== '');

    if (filesToZip.length === 0) {
      return bot.sendMessage(chatId, '📭 Tidak ada file yang dapat di-backup.');
    }

    // Buat file ZIP
    execSync(`zip -r ${name}.zip ${filesToZip.join(' ')}`);
    
    // Kirim file ke owner
    await bot.sendDocument(chatId, `./${name}.zip`, {
      caption: `✅ Backup berhasil dibuat!\n📅 ${tgl} ${jam.replace('.', ':')}`,
      contentType: 'application/zip'
    });
    
    // Hapus file ZIP setelah dikirim
    fs.unlinkSync(`./${name}.zip`);
    
  } catch (err) {
    console.error('Backup Error:', err);
    bot.sendMessage(chatId, `❌ Terjadi kesalahan saat backup:\n${err.message}`);
  }
});

// Command: /antilink
bot.onText(/^\/antilink\s+(on|off)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const option = match[1].toLowerCase();
  
  // Only works in groups
  if (msg.chat.type === 'private') {
    return bot.sendMessage(chatId, '❌ Fitur ini hanya tersedia di grup!', {
      reply_to_message_id: msg.message_id
    });
  }
  
  try {
    // Check if user is admin
    const chatAdmins = await bot.getChatAdministrators(chatId);
    const isAdmin = chatAdmins.some(admin => admin.user.id === userId);
    
    if (!isAdmin) {
      return bot.sendMessage(chatId, '❌ Hanya admin grup yang bisa mengatur antilink!', {
        reply_to_message_id: msg.message_id
      });
    }
    
    // Check if bot is admin
    const botInfo = await bot.getMe();
    const isBotAdmin = chatAdmins.some(admin => admin.user.id === botInfo.id);
    
    if (!isBotAdmin) {
      return bot.sendMessage(chatId, '❌ Bot harus menjadi admin untuk mengatur antilink!', {
        reply_to_message_id: msg.message_id
      });
    }
    
    if (option === 'on') {
      if (antilinkGroups.includes(chatId)) {
        return bot.sendMessage(chatId, 'ℹ️ Antilink sudah aktif di grup ini!', {
          reply_to_message_id: msg.message_id
        });
      }
      
      antilinkGroups.push(chatId);
      saveAntilinkData();
      return bot.sendMessage(chatId, '✅ Antilink berhasil diaktifkan!', {
        reply_to_message_id: msg.message_id
      });
    } 
    else if (option === 'off') {
      if (!antilinkGroups.includes(chatId)) {
        return bot.sendMessage(chatId, 'ℹ️ Antilink belum aktif di grup ini!', {
          reply_to_message_id: msg.message_id
        });
      }
      
      antilinkGroups = antilinkGroups.filter(id => id !== chatId);
      saveAntilinkData();
      return bot.sendMessage(chatId, '❌ Antilink berhasil dimatikan!', {
        reply_to_message_id: msg.message_id
      });
    }
  } catch (error) {
    logError(error, '/antilink');
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengatur antilink', {
      reply_to_message_id: msg.message_id
    });
  }
});

// Handle messages with links
bot.on('message', async (msg) => {
  // Only process in groups with antilink enabled
  if (!antilinkGroups.includes(msg.chat.id)) return;
  
  // Only process text messages
  const messageText = msg.text || msg.caption || '';
  if (!messageText) return;
  
  // Check for blocked links
  const isGroupLink = messageText.includes('https://chat.whatsapp.com/');
  const isChannelLink = messageText.includes('https://whatsapp.com/channel/');
  
  if (!isGroupLink && !isChannelLink) return;
  
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const messageId = msg.message_id;
    
    // Get group info
    const chatAdmins = await bot.getChatAdministrators(chatId);
    
    // Check if sender is admin
    const isAdmin = chatAdmins.some(admin => admin.user.id === userId);
    
    // Check if sender is owner
    const isOwner = userId === config.INITIAL_OWNER;
    
    // Process non-admin/non-owner
    if (!isAdmin && !isOwner) {
      // Check if bot is admin
      const botInfo = await bot.getMe();
      const isBotAdmin = chatAdmins.some(admin => admin.user.id === botInfo.id);
      
      if (!isBotAdmin) {
        // Disable antilink if bot is not admin
        antilinkGroups = antilinkGroups.filter(id => id !== chatId);
        saveAntilinkData();
        return;
      }
      
      // Send warning
      const mention = `[${msg.from.first_name}](tg://user?id=${userId})`;
      await bot.sendMessage(chatId, `${mention} jangan share link ya sob 😅`, {
        parse_mode: 'Markdown',
        reply_to_message_id: messageId
      });
      
      // Delete message
      try {
        await bot.deleteMessage(chatId, messageId);
      } catch (deleteError) {
        if (deleteError.response?.error_code === 400) {
          console.log('Pesan sudah dihapus sebelumnya');
        } else {
          throw deleteError;
        }
      }
    }
  } catch (error) {
    logError(error, 'antilinkHandler');
    console.error('Gagal proses anti-link:', error);
  }
});

// Command: /hidetag
bot.onText(/^\/hidetag(?:\s+)?(.+)?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = (match[1] || '').trim();

  if (msg.chat.type === 'private') {
    return bot.sendMessage(chatId, '❌ Fitur ini hanya tersedia di grup!', {
      reply_to_message_id: msg.message_id
    });
  }

  try {
    const chatAdmins = await bot.getChatAdministrators(chatId);
    const isAdmin = chatAdmins.some(admin => admin.user.id === userId);
    
    if (!isAdmin) {
      return bot.sendMessage(chatId, '❌ Hanya admin grup yang bisa menggunakan fitur ini!', {
        reply_to_message_id: msg.message_id
      });
    }

    const botInfo = await bot.getMe();
    const isBotAdmin = chatAdmins.some(admin => admin.user.id === botInfo.id);
    
    if (!isBotAdmin) {
      return bot.sendMessage(chatId, '❌ Bot harus menjadi admin untuk melakukan hidetag!', {
        reply_to_message_id: msg.message_id
      });
    }

    await bot.sendMessage(chatId, text || 'Hai semua anggota grup! 👋', {
      disable_notification: false,
      entities: [{
        type: 'mention',
        offset: 0,
        length: text.length || 20
      }]
    });

  } catch (error) {
    logError(error, '/hidetag');
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat melakukan hidetag', {
      reply_to_message_id: msg.message_id
    });
  }
});

// Command: /tagall
bot.onText(/^\/tagall(?:\s+)?(.+)?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = (match[1] || '').trim();

  // Hanya bekerja di grup
  if (msg.chat.type === 'private') {
    return bot.sendMessage(chatId, '❌ Fitur ini hanya tersedia di grup!', {
      reply_to_message_id: msg.message_id
    });
  }

  try {
    // Cek apakah pengirim adalah admin grup
    const chatAdmins = await bot.getChatAdministrators(chatId);
    const isAdmin = chatAdmins.some(admin => admin.user.id === userId);
    
    if (!isAdmin) {
      return bot.sendMessage(chatId, '❌ Hanya admin grup yang bisa menggunakan fitur ini!', {
        reply_to_message_id: msg.message_id
      });
    }

    // Cek apakah bot adalah admin
    const botInfo = await bot.getMe();
    const isBotAdmin = chatAdmins.some(admin => admin.user.id === botInfo.id);
    
    if (!isBotAdmin) {
      return bot.sendMessage(chatId, '❌ Bot harus menjadi admin untuk melakukan tag semua!', {
        reply_to_message_id: msg.message_id
      });
    }

    // Format pesan utama
    let message = `══✪〘 *👥 TAG ALL* 〙✪══\n`;
    message += `➲ *Pesan :* ${text || 'Tidak ada pesan tambahan'}\n\n`;
    message += `Admin grup:\n`;

    // Buat daftar mention untuk semua admin
    const adminMentions = [];
    for (const admin of chatAdmins) {
      // Gunakan username jika ada, atau nama depan + link mention
      const mention = admin.user.username 
        ? `@${admin.user.username}` 
        : `[${admin.user.first_name}](tg://user?id=${admin.user.id})`;
      
      adminMentions.push(mention);
      message += `⭔ ${mention}\n`;
    }

    // Kirim pesan dengan mention semua admin
    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_to_message_id: msg.message_id,
      reply_markup: {
        inline_keyboard: [[
          { 
            text: '👥 Tag Semua Anggota', 
            url: `https://t.me/${msg.chat.username}`
          }
        ]]
      }
    });

    // Kirim pesan notifikasi untuk semua anggota
    await bot.sendMessage(chatId, '──────⊹⊱✫⊰⊹──────\n' + 
      '📢 *Perhatian semua anggota grup!* \n' + 
      'Silakan periksa pesan di atas 👆', {
      parse_mode: 'Markdown',
      disable_notification: false // Aktifkan notifikasi
    });

  } catch (error) {
    logError(error, '/tagall');
    bot.sendMessage(chatId, '❌ Terjadi kesalahan: ' + error.message, {
      reply_to_message_id: msg.message_id
    });
  }
});

// Command: /tts
bot.onText(/^\/tts(?:\s+)?(.+)?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const text = (match[1] || '').trim();

  if (!text) {
    return bot.sendMessage(chatId, 'Contoh: /tts halo dunia');
  }

  try {
    // Kirim indikator pemrosesan
    const processingMsg = await bot.sendMessage(chatId, '🔊 Membuat suara...', {
      reply_to_message_id: msg.message_id
    });

    // Gunakan API alternatif yang lebih reliable
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=id&client=tw-ob`;
    
    // Kirim audio langsung
    await bot.sendAudio(chatId, ttsUrl, {
      title: 'TTS Result',
      performer: 'Google TTS',
      caption: `🔊 Hasil Text-to-Speech untuk: "${text}"`
    });

    // Hapus pesan pemrosesan
    await bot.deleteMessage(chatId, processingMsg.message_id);

  } catch (error) {
    console.error('TTS Error:', error);
    
    // Alternatif kedua jika API pertama gagal
    try {
      const fallbackUrl = `https://api.akuari.my.id/text2speech?text=${encodeURIComponent(text)}&lang=id`;
      await bot.sendAudio(chatId, fallbackUrl, {
        caption: `🔊 Hasil TTS (Alternatif) untuk: "${text}"`
      });
    } catch (fallbackError) {
      console.error('Fallback TTS Error:', fallbackError);
      bot.sendMessage(chatId, '❌ Gagal membuat audio. Silakan coba lagi nanti.');
    }
  }
});

// Command: /deploybtwo [subdomain]
bot.onText(/^\/deploybtwo(?:\s+)?(.+)?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const subdomainInput = (match[1] || '').trim();

  if (!subdomainInput) {
    return bot.sendMessage(chatId, '❌ Masukkan nama subdomain!\nContoh: /deploybtwo namasubdomain');
  }

  // Format subdomain
  const rawInput = subdomainInput.toLowerCase().replace(/\s+/g, '-');
  const subdomain = rawInput.replace(/[^a-z0-9-]/g, '');
  
  if (!/^[a-z0-9-]{3,64}$/.test(subdomain)) {
    return bot.sendMessage(chatId, '❌ Nama subdomain tidak valid!\nHanya huruf kecil, angka, dan strip (-), minimal 3 karakter.');
  }

  try {
    const processingMsg = await bot.sendMessage(chatId, '🌀 Sedang mendepoy, tunggu sebentar...');
    
    // Cek apakah ada file yang di-reply
    if (!msg.reply_to_message || !msg.reply_to_message.document) {
      return bot.editMessageText('❌ Kirim file HTML/ZIP dengan cara reply file!', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
    }

    const quoted = msg.reply_to_message;
    const file = quoted.document;
    const mime = file.mime_type;
    const isHtml = mime.includes('html');
    const isZip = mime.includes('zip');

    if (!isHtml && !isZip) {
      return bot.editMessageText('❌ File harus HTML atau ZIP!', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
    }

    // Download file
    const fileUrl = await bot.getFileLink(file.file_id);
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    // Prepare form data
    const form = new FormData();
    form.append('subdomain', subdomain);
    form.append('file', buffer, {
      filename: file.file_name || (isHtml ? 'index.html' : 'project.zip'),
      contentType: mime
    });

    // Send to deploy API
    const resApi = await axios.post('https://apii.baguss.web.id/deploy', form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    if (!resApi.data.success) {
      return bot.editMessageText(`❌ Gagal deploy:\n${resApi.data.message || 'Unknown error'}`, {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
    }

    // Success response
    bot.editMessageText(
      `✅ *Situs Berhasil Dideploy!*\n\n` +
      `🌐 URL: ${resApi.data.fullDomain}\n` +
      `🕒 Website aktif 1–5 menit.\n` +
      `🔁 Jika belum muncul, tunggu sebentar lalu refresh.`,
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: 'Markdown'
      }
    );

  } catch (err) {
    console.error('Deploy error:', err);
    bot.sendMessage(chatId, `❌ Terjadi kesalahan:\n${err.message}`);
  }
});

// Command: /ffstalk
bot.onText(/^\/ffstalk(?:\s+)?(.+)?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = (match[1] || '').trim();
  
  if (!text) {
    return bot.sendMessage(chatId, `🎮 *FREE FIRE STALKER*\n\nKirim UID Free Fire setelah command!\nContoh: /ffstalk 2134554847`, {
      reply_to_message_id: msg.message_id
    });
  }
  
  // Kirim pesan loading
  await bot.sendMessage(chatId, '🕒 Mencari data akun Free Fire...', {
    reply_to_message_id: msg.message_id
  });
  
  try {
    // Ekstrak dan validasi UID
    const uid = text.match(/[0-9]+/)?.[0] || '';
    
    // Validasi UID ketat
    if (!uid || uid.length < 7 || uid.length > 12) {
      return bot.sendMessage(chatId, '❌ *FORMAT UID SALAH!*\nUID harus 7-12 digit angka\nContoh: 2134554847', {
        reply_to_message_id: msg.message_id
      });
    }
    
    // Fungsi fetch dengan proteksi error dan retry
    const safeFetch = async (url, retries = 2) => {
      for (let i = 0; i <= retries; i++) {
        try {
          const { data } = await axios.get(url, {
            headers: {
              'Origin': 'https://www.freefirecommunity.com',
              'Referer': 'https://www.freefirecommunity.com/ff-account-info/',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
              'Connection': 'keep-alive'
            },
            timeout: 15000
          });
          return data;
        } catch (e) {
          console.error(`API Error (attempt ${i + 1}):`, e.message);
          if (i === retries) {
            throw new Error('SERVER FREE FIRE SIBUK! COBA LAGI NANTI');
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    };
    
    // Fetch data utama
    const playerData = await safeFetch(`https://discordbot.freefirecommunity.com/player_info_api?uid=${uid}®ion=id`);
    
    // Validasi data response
    if (!playerData || !playerData.player_info) {
      throw new Error('AKUN TIDAK DITEMUKAN! PASTIKAN UID BENAR');
    }
    
    // Ekstrak data dengan fallback
    const playerInfo = playerData.player_info;
    const basicInfo = playerInfo.basicInfo || {};
    const tierInfo = playerInfo.tier || {};
    const statsInfo = playerInfo.statistics || {};
    
    // Fungsi ekstrak data aman dengan penanganan array dan object
    const getValue = (obj, key) => {
      if (!obj || !obj[key]) return '0';
      const value = obj[key];
      if (Array.isArray(value) && value.length > 0) {
        return value[0]?.value || '0';
      }
      return value || '0';
    };
    
    // Format waktu Indonesia
    const formatTime = (timestamp) => {
      if (!timestamp) return '-';
      try {
        const date = new Date(timestamp * 1000);
        return date.toLocaleString('id-ID', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Jakarta'
        });
      } catch {
        return '-';
      }
    };
    
    // Format win rate
    const formatWinRate = (winRate) => {
      if (!winRate || winRate === '0') return '0';
      const rate = parseFloat(winRate);
      return isNaN(rate) ? '0' : rate.toFixed(2);
    };
    
    // Format K/D ratio
    const formatKD = (kd) => {
      if (!kd || kd === '0') return '0.00';
      const ratio = parseFloat(kd);
      return isNaN(ratio) ? '0.00' : ratio.toFixed(2);
    };
    
    // Build caption dengan format yang sesuai dengan bot
    const caption = 
`🎮 *FREE FIRE ACCOUNT INFO*

👤 *Nickname*: ${basicInfo.nickname || 'Unknown'}
🆔 *UID*: ${basicInfo.accountId || uid}
⭐ *Level*: ${basicInfo.level || '1'}

🏆 *RANK INFO*
├ 🎖️ Current Rank: ${basicInfo.rank || 'Bronze'}
├ 📊 CS Rank: ${basicInfo.csRank || 'Bronze'}
└ 🏅 Tier Points: ${tierInfo.points || '0'}

📊 *GAME STATISTICS*
├ 🎯 Total Match: ${getValue(statsInfo, 'totalMatches')}
├ 🏆 Win Rate: ${formatWinRate(getValue(statsInfo, 'winRate'))}%
├ 🔫 Total Kills: ${getValue(statsInfo, 'kills')}
├ 💀 Headshots: ${getValue(statsInfo, 'headshots')}
└ ⚔️ K/D Ratio: ${formatKD(getValue(statsInfo, 'kdRatio'))}

📅 *ACCOUNT INFO*
├ 📝 Created: ${formatTime(basicInfo.createAt)}
└ ⏱️ Last Login: ${formatTime(basicInfo.lastLoginAt)}

🔍 *Stalked by*: ${msg.from.first_name}
📢 *Powered by*: ${config.NAMABOT}
`;

    // URL banner dengan timestamp untuk cache busting
    const bannerUrl = `https://discordbot.freefirecommunity.com/banner_image_api?uid=${uid}®ion=id&t=${Date.now()}`;
    
    // Proses banner dengan timeout yang lebih pendek
    try {
      const bannerResponse = await axios.get(bannerUrl, {
        responseType: 'arraybuffer',
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      // Validasi response banner
      if (bannerResponse.data && bannerResponse.data.byteLength > 0) {
        await bot.sendPhoto(chatId, Buffer.from(bannerResponse.data), {
          caption: caption,
          parse_mode: 'Markdown',
          reply_to_message_id: msg.message_id
        });
      } else {
        throw new Error('Empty banner');
      }
      
    } catch (bannerError) {
      console.error('Banner Error:', bannerError.message);
      // Kirim tanpa banner jika error
      await bot.sendMessage(chatId, caption + '\n\n⚠️ *Banner tidak tersedia*', {
        parse_mode: 'Markdown',
        reply_to_message_id: msg.message_id
      });
    }
    
  } catch (err) {
    console.error('FFStalk ERROR:', err);
    
    // Error handling yang lebih spesifik
    let errorMsg = '❌ *GAGAL MENGAMBIL DATA*\n\n';
    
    if (err.message.includes('SERVER')) {
      errorMsg += '🔧 Server Free Fire sedang sibuk\n⏳ Coba lagi dalam beberapa menit';
    } else if (err.message.includes('AKUN')) {
      errorMsg += '🔍 Akun tidak ditemukan\n✅ Pastikan UID benar dan akun public';
    } else if (err.message.includes('timeout')) {
      errorMsg += '⏱️ Koneksi timeout\n🔄 Coba lagi dengan koneksi yang lebih stabil';
    } else {
      errorMsg += '⚠️ Terjadi kesalahan sistem\n🔄 Silakan coba lagi nanti';
    }
    
    await bot.sendMessage(chatId, errorMsg, {
      parse_mode: 'Markdown',
      reply_to_message_id: msg.message_id
    });
  }
});    
    
// Tangani error polling
bot.on('polling_error', (error) => {
  logError(error, 'Polling Error');
  console.error('Polling Error:', error);
});

//     Console log

console.clear();
console.log(chalk.bold.white(`\n
⣿⣿⣷⡁⢆⠈⠕⢕⢂⢕⢂⢕⢂⢕⢂⢕⢄⠂⣂⠂⠆⢂⢕⢂⢕⢂⢕⢂⢕⢂
⣿⣿⣿⡷⠊⡢⡹⣦⡑⢂⢕⢂⢕⢂⢕⢂⠕⠔⠌⠝⠛⠶⠶⢶⣦⣄⢂⢕⢂⢕
⣿⣿⠏⣠⣾⣦⡐⢌⢿⣷⣦⣅⡑⠕⠡⠐⢿⠿⣛⠟⠛⠛⠛⠛⠡⢷⡈⢂⢕⢂
⠟⣡⣾⣿⣿⣿⣿⣦⣑⠝⢿⣿⣿⣿⣿⣿⡵⢁⣤⣶⣶⣿⢿⢿⢿⡟⢻⣤⢑⢂
⣾⣿⣿⡿⢟⣛⣻⣿⣿⣿⣦⣬⣙⣻⣿⣿⣷⣿⣿⢟⢝⢕⢕⢕⢕⢽⣿⣿⣷⣔
⣿⣿⠵⠚⠉⢀⣀⣀⣈⣿⣿⣿⣿⣿⣿⣿⣿⣿⣗⢕⢕⢕⢕⢕⢕⣽⣿⣿⣿⣿
⢷⣂⣠⣴⣾⡿⡿⡻⡻⣿⣿⣴⣿⣿⣿⣿⣿⣿⣷⣵⣵⣵⣷⣿⣿⣿⣿⣿⣿⡿
⢌⠻⣿⡿⡫⡪⡪⡪⡪⣺⣿⣿⣿⣿⣿⠿⠿⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠃
⠣⡁⠹⡪⡪⡪⡪⣪⣾⣿⣿⣿⣿⠋⠐⢉⢍⢄⢌⠻⣿⣿⣿⣿⣿⣿⣿⣿⠏⠈
⡣⡘⢄⠙⣾⣾⣾⣿⣿⣿⣿⣿⣿⡀⢐⢕⢕⢕⢕⢕⡘⣿⣿⣿⣿⣿⣿⠏⠠⠈
⠌⢊⢂⢣⠹⣿⣿⣿⣿⣿⣿⣿⣿⣧⢐⢕⢕⢕⢕⢕⢅⣿⣿⣿⣿⡿⢋⢜⠠⠈
⠄⠁⠕⢝⡢⠈⠻⣿⣿⣿⣿⣿⣿⣿⣷⣕⣑⣑⣑⣵⣿⣿⣿⡿⢋⢔⢕⣿⠠⠈
⠨⡂⡀⢑⢕⡅⠂⠄⠉⠛⠻⠿⢿⣿⣿⣿⣿⣿⣿⣿⣿⡿⢋⢔⢕⢕⣿⣿⠠⠈
⠄⠪⣂⠁⢕⠆⠄⠂⠄⠁⡀⠂⡀⠄⢈⠉⢍⢛⢛⢛⢋⢔⢕⢕⢕⣽⣿⣿⠠⠈
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`));

console.log(chalk.whiteBright.bold(`
╭────────────────────────────────────
┃ ${chalk.yellowBright.bold('BOT DATABASE | ACTIVE')}
┃ ${chalk.green.bold('🤖 Bot started for owner:')} ${chalk.green.bold(config.INITIAL_OWNER)}
┃ ${chalk.yellow.bold('🚀 Bot has been Runings...')}
╰────────────────────────────────────\n`));
console.log(chalk.cyanBright.bold('Developed | FikXzModsTzy'));

require("./server.js");
