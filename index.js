const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const config = require('./settings.json');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot has arrived'));
app.listen(8000, () => console.log('Server started'));

let bot; // تم تعريف البوت هنا ليكون متاحًا عالميًا

function getRandomUsername() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `Bot_${suffix}`;
}

function createBot() {
  // إذا كان هناك بوت موجود بالفعل، قم بقطعه أولاً
  if (bot) {
    console.log('[INFO] Quitting current bot before creating a new one.');
    // مسح أي interval للدردشة موجود لتجنب تسرب الذاكرة
    if (bot.chatInterval) {
      clearInterval(bot.chatInterval);
      bot.chatInterval = null; // إعادة تعيين الخاصية
    }
    bot.quit();
    bot = null; // تعيين bot إلى null لضمان إنشاء instance جديد تمامًا
  }

  const username = getRandomUsername();
  console.log(`[INFO] Creating bot with username: ${username}`);

  bot = mineflayer.createBot({
    username: username,
    password: config['bot-account']['password'],
    auth: config['bot-account']['type'],
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  });

  bot.loadPlugin(pathfinder);

  let pendingPromise = Promise.resolve();

  function sendRegister(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/register ${password} ${password}`);
      console.log(`[Auth] Sent /register command.`);
      bot.once('chat', (username, message) => {
        console.log(`[ChatLog] <${username}> ${message}`);
        if (message.includes('successfully registered') || message.includes('already registered')) {
          resolve();
        } else {
          reject(`Registration error: ${message}`);
        }
      });
      // إضافة مهلة لتجنب التعليق إذا لم يستجب السيرفر
      setTimeout(() => reject('Registration timed out.'), 10000); // 10 ثواني
    });
  }

  function sendLogin(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/login ${password}`);
      console.log(`[Auth] Sent /login command.`);
      bot.once('chat', (username, message) => {
        console.log(`[ChatLog] <${username}> ${message}`);
        if (message.includes('successfully logged in')) {
          resolve();
        } else {
          reject(`Login error: ${message}`);
        }
      });
      // إضافة مهلة لتجنب التعليق إذا لم يستجب السيرفر
      setTimeout(() => reject('Login timed out.'), 10000); // 10 ثواني
    });
  }

  bot.once('spawn', () => {
    console.log('\x1b[33m[AfkBot] Bot joined the server\x1b[0m');

    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);

    if (config.utils['auto-auth'].enabled) {
      const password = config.utils['auto-auth'].password;
      pendingPromise = pendingPromise
        .then(() => sendRegister(password))
        .then(() => sendLogin(password))
        .catch(error => console.error(`\x1b[31m[ERROR] ${error}\x1b[0m`));
    }

    if (config.utils['chat-messages'].enabled) {
      const messages = config.utils['chat-messages']['messages'];
      if (config.utils['chat-messages'].repeat) {
        const delay = config.utils['chat-messages']['repeat-delay'];
        let i = 0;
        // حفظ الـ interval ID على كائن البوت لمسحه لاحقًا
        bot.chatInterval = setInterval(() => {
          bot.chat(messages[i]);
          i = (i + 1) % messages.length;
        }, delay * 1000);
      } else {
        messages.forEach(msg => bot.chat(msg));
      }
    }

    const pos = config.position;
    if (config.position.enabled) {
      console.log(`\x1b[32m[Afk Bot] Moving to (${pos.x}, ${pos.y}, ${pos.z})\\x1b[0m`);
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
    }

    if (config.utils['anti-afk'].enabled) {
      bot.setControlState('jump', true);
      if (config.utils['anti-afk'].sneak) {
        bot.setControlState('sneak', true);
      }
    }
  });

  // حدث 'end' يتم تشغيله عند قطع الاتصال لأي سبب (طرد، خطأ، أو quit())
  bot.on('end', (reason) => {
    console.log(`\x1b[33m[AfkBot] Bot disconnected. Reason: ${reason}\x1b[0m`);
    // مسح أي interval للدردشة موجود لتجنب تسرب الذاكرة
    if (bot.chatInterval) {
        clearInterval(bot.chatInterval);
        bot.chatInterval = null;
    }
    if (config.utils['auto-reconnect']) {
      console.log(`[INFO] Reconnecting in ${config.utils['auto-recconect-delay'] / 1000} seconds with new username...`);
      setTimeout(() => createBot(), config.utils['auto-recconect-delay']);
    }
  });

  bot.on('kicked', reason => {
    // حدث 'end' سيتكفل بإعادة الاتصال، لذا لا داعي لتكرار المنطق هنا.
    console.log(`\x1b[33m[AfkBot] Kicked from server:\n${reason}\x1b[0m`);
  });

  bot.on('error', err => {
    // حدث 'end' سيتكفل بإعادة الاتصال، لذا لا داعي لتكرار المنطق هنا.
    console.log(`\x1b[31m[ERROR] ${err.message}\x1b[0m`);
  });

  bot.on('goal_reached', () => {
    console.log(`\x1b[32m[AfkBot] Bot arrived at target: ${bot.entity.position}\x1b[0m`);
  });

  bot.on('death', () => {
    console.log(`\x1b[33m[AfkBot] Bot died. Respawned at ${bot.entity.position}\x1b[0m`);
  });
}

// ابدأ البوت لأول مرة
createBot();

// جدولة إعادة تشغيل دورية (على سبيل المثال، كل دقيقة) لتغيير اسم المستخدم
// إذا كنت تريد أن يعيد البوت الاتصال فقط عند الطرد/الخطأ، يمكنك إزالة هذا الـ setInterval.
// وإلا، إذا أردت تغيير الاسم بشكل دوري بالإضافة إلى إعادة الاتصال عند المشاكل، فاتركه.
setInterval(() => {
  console.log('[INFO] Scheduled restart: changing bot username...');
  createBot(); // هذه الدالة الآن تتعامل مع قطع اتصال البوت القديم وإنشاء بوت جديد.
}, 60 * 1000); // تغيير الاسم كل 1 دقيقة (60,000 ملي ثانية)