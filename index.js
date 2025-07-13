const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const config = require('./settings.json');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot has arrived'));
app.listen(8000, () => console.log('Server started'));

let bot;

function getRandomUsername() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `Bot_${suffix}`;
}

function createBot() {
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
        setInterval(() => {
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
      bot.setControlState('jump', true);
      if (config.utils['anti-afk'].sneak) {
        bot.setControlState('sneak', true);
      }
    }
  });

  bot.on('goal_reached', () => {
    console.log(`\x1b[32m[AfkBot] Bot arrived at target: ${bot.entity.position}\x1b[0m`);
  });

  bot.on('death', () => {
    console.log(`\x1b[33m[AfkBot] Bot died. Respawned at ${bot.entity.position}\x1b[0m`);
  });

  // إذا انطرد أو انقطع الاتصال يدخل باسم جديد
  bot.on('kicked', reason => {
    console.log(`\x1b[33m[AfkBot] Kicked from server:\n${reason}\x1b[0m`);
    setTimeout(() => createBot(), 3000); // انتظر 3 ثواني قبل إعادة الاتصال
  });

  bot.on('end', () => {
    console.log(`[INFO] Connection ended. Reconnecting...`);
    setTimeout(() => createBot(), 3000);
  });

  bot.on('error', err => {
    console.log(`\x1b[31m[ERROR] ${err.message}\x1b[0m`);
  });
}

// أول تشغيل
createBot();

// تغيير الاسم كل 3 ساعات مهما حصل
setInterval(() => {
  console.log('[INFO] Scheduled username change. Restarting bot...');
  if (bot) bot.quit(); // يؤدي إلى تشغيل on('end') والدخول باسم جديد
}, 3 * 60 * 60 * 1000); // 3 ساعات
