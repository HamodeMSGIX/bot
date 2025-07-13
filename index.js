const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const config = require('./settings.json');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(8000, () => console.log('Server started'));

let bot;
let msgTimer;

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

  bot.once('spawn', () => {
    console.log('[INFO] Bot joined the server');

    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);

    if (config.utils['auto-auth'].enabled) {
      const password = config.utils['auto-auth'].password;
      pendingPromise = pendingPromise
        .then(() => sendRegister(password))
        .then(() => sendLogin(password))
        .catch(err => console.error(`[ERROR] ${err}`));
    }

    if (config.utils['chat-messages'].enabled) {
      const messages = config.utils['chat-messages']['messages'];
      if (config.utils['chat-messages'].repeat) {
        const delay = config.utils['chat-messages']['repeat-delay'];
        let i = 0;
        msgTimer = setInterval(() => {
          if (bot) bot.chat(messages[i]);
          i = (i + 1) % messages.length;
        }, delay * 1000);
      } else {
        messages.forEach(msg => bot.chat(msg));
      }
    }

    if (config.position.enabled) {
      const pos = config.position;
      console.log(`[INFO] Moving to (${pos.x}, ${pos.y}, ${pos.z})`);
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
    }

    if (config.utils['anti-afk'].enabled) {
      bot.setControlState('jump', true);
      if (config.utils['anti-afk'].sneak) {
        bot.setControlState('sneak', true);
      }
    }

    // Example: physicsTick if you want it
    bot.on('physicsTick', () => {
      // Do something on every tick if needed
    });
  });

  bot.on('goal_reached', () => {
    console.log(`[INFO] Goal reached: ${bot.entity.position}`);
  });

  bot.on('death', () => {
    console.log('[INFO] Bot died');
  });

  bot.on('kicked', reason => {
    console.log(`[INFO] Bot kicked: ${reason}`);
    reconnectBot();
  });

  bot.on('end', () => {
    console.log('[INFO] Connection ended.');
    reconnectBot();
  });

  bot.on('error', err => {
    console.log(`[ERROR] ${err.message}`);
  });

  function sendRegister(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/register ${password} ${password}`);
      console.log('[Auth] Sent /register');
      bot.once('chat', (username, message) => {
        if (message.includes('successfully registered') || message.includes('already registered')) {
          resolve();
        } else {
          reject(`Register failed: ${message}`);
        }
      });
    });
  }

  function sendLogin(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/login ${password}`);
      console.log('[Auth] Sent /login');
      bot.once('chat', (username, message) => {
        if (message.includes('successfully logged in')) {
          resolve();
        } else {
          reject(`Login failed: ${message}`);
        }
      });
    });
  }
}

function reconnectBot() {
  if (msgTimer) clearInterval(msgTimer);
  setTimeout(() => createBot(), 3000);
}

createBot();

// تغيير الاسم كل 3 ساعات
setInterval(() => {
  console.log('[INFO] Scheduled username change (3 hours)');
  if (bot) {
    if (msgTimer) clearInterval(msgTimer);
    bot.quit();
  }
}, 3 * 60 * 60 * 1000);
