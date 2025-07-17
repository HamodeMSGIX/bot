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
    bot.quit();
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
      // نستخدم bot.once لتجنب الاستماع لرسائل الدردشة بشكل دائم
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
      // نستخدم bot.once لتجنب الاستماع لرسائل الدردشة بشكل دائم
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
        // حفظ الـ intervalId لإيقافه عند قطع اتصال البوت
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
      console.log(`\x1b[32m[Afk Bot] Moving to (${pos.x}, ${pos.y}, ${pos.z})\x1b[0m`);
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
    }

    if (config.utils['anti-afk'].enabled) {
      // استخدام 'physicsTick' بدلاً من 'physicTick' كما اقترح Mineflayer
      // يجب أن تكون هذه المشكلة قد تم حلها بالفعل في الإصدارات الأحدث من Mineflayer
      // ولكن للتأكد، هذه هي الطريقة الصحيحة لتعيين التحكم
      bot.setControlState('jump', true);
      if (config.utils['anti-afk'].sneak) {
        bot.setControlState('sneak', true);
      }
    }
  });

  // حدث 'end' يتم تشغيله عند قطع الاتصال (سواء بسبب طرد، خطأ، أو quit())
  bot.on('end', (reason) => {
    console.log(`\x1b[33m[AfkBot] Bot disconnected. Reason: ${reason}\x1b[0m`);
    // مسح الـ interval للدردشة لتجنب تسرب الذاكرة
    if (bot.chatInterval) {
        clearInterval(bot.chatInterval);
    }
    if (config.utils['auto-reconnect']) {
      // أعد إنشاء البوت بعد تأخير، مما يجعله يدخل باسم جديد
      console.log(`[INFO] Reconnecting in ${config.utils['auto-recconect-delay'] / 1000} seconds with new username...`);
      setTimeout(() => createBot(), config.utils['auto-recconect-delay']);
    }
  });

  bot.on('kicked', reason => {
    console.log(`\x1b[33m[AfkBot] Kicked from server:\n${reason}\x1b[0m`);
    // لا تحتاج إلى إعادة اتصال هنا، لأن حدث 'end' سيتكفل بذلك
  });

  bot.on('error', err => {
    console.log(`\x1b[31m[ERROR] ${err.message}\x1b[0m`);
    // لا تحتاج إلى إعادة اتصال هنا، لأن حدث 'end' سيتكفل بذلك
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

// قم بإعادة تشغيل البوت كل دقيقة (60 ثانية * 1000 ملي ثانية = 60000 ملي ثانية)
// هذا الـ setInterval لإعادة تشغيل البوت بشكل دوري (تغيير الاسم)
// إذا كنت تريد البوت يعيد الاتصال فقط عند الطرد/الخطأ، يمكنك إزالة هذا الجزء
// وإلا، إذا أردت تغيير الاسم بشكل دوري بالإضافة إلى إعادة الاتصال عند المشاكل، فاتركه
setInterval(() => {
  console.log('[INFO] Restarting bot with new username (scheduled restart)...');
  createBot();
}, 6000 * 1000); // 60000 ملي ثانية = 1 دقيقة
