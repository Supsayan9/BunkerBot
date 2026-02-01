require("dotenv").config();
const { Client, GatewayIntentBits, Events } = require("discord.js");
const { joinVoiceChannel, getVoiceConnection } = require("@discordjs/voice");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
});

const connections = new Map();
const userCards = new Map(); // Хранение карточек игроков по userId

// Пример шаблонов карточек
const cardsTemplates = [
  { name: "Выживший", power: 5, skill: "Скрытность" },
  { name: "Инженер", power: 3, skill: "Создание ловушек" },
  { name: "Доктор", power: 4, skill: "Исцеление" },
  { name: "Разведчик", power: 2, skill: "Быстрое передвижение" },
];

// ---------------- READY ----------------
client.once(Events.ClientReady, async () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);

  // При запуске проверяем всех в канале "бункер" для авто-DM
  client.guilds.cache.forEach(async (guild) => {
    const bunkerChannel = guild.channels.cache.find(
      (c) => c.type === 2 && c.name.toLowerCase() === "бункер"
    );
    if (!bunkerChannel) return;

    bunkerChannel.members.forEach(async (member) => {
      if (!member.user.bot) {
        assignCardAndSendDM(member);
      }
    });
  });
});

// ---------------- ФУНКЦИЯ ВЫДАЧИ КАРТОЧКИ ----------------
async function assignCardAndSendDM(member) {
  if (userCards.has(member.id)) return; // Уже есть карточка

  const card =
    cardsTemplates[Math.floor(Math.random() * cardsTemplates.length)];
  userCards.set(member.id, card);

  try {
    await member.send(
      `Привет, ${member.displayName}! Добро пожаловать в Бункер! 🏰\n` +
        `Твоя карточка персонажа:\n` +
        `**${card.name}**\n` +
        `Сила: ${card.power}\n` +
        `Навык: ${card.skill}`
    );
    console.log(`✅ Отправлено приветствие и карточка ${member.user.tag}`);
  } catch {
    console.log(`❌ Не удалось отправить DM пользователю ${member.user.tag}`);
  }
}

// ---------------- VOICE STATE UPDATE ----------------
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

  // Новый пользователь вошёл в канал "бункер"
  if (
    (!oldChannel || oldChannel.id !== newChannel?.id) &&
    newChannel?.name.toLowerCase() === "бункер"
  ) {
    const guildId = newChannel.guild.id;

    // Подключение бота к каналу
    if (!connections.has(guildId)) {
      try {
        const connection = joinVoiceChannel({
          channelId: newChannel.id,
          guildId,
          adapterCreator: newChannel.guild.voiceAdapterCreator,
        });
        connections.set(guildId, connection);
        console.log(`🔊 Бот подключился к каналу "${newChannel.name}"`);
      } catch (err) {
        console.error("❌ Не удалось подключиться к голосовому каналу:", err);
      }
    }

    // Отправка DM с карточкой
    assignCardAndSendDM(member);
  }

  // Авто-выход из канала
  const connection = connections.get(newState.guild.id);
  if (connection) {
    const botChannel = newState.guild.channels.cache.get(
      connection.joinConfig.channelId
    );
    if (!botChannel) return;

    const nonBotMembers = botChannel.members.filter((m) => !m.user.bot);
    if (nonBotMembers.size === 0) {
      connection.destroy();
      connections.delete(newState.guild.id);
      console.log(
        `🔌 Бот вышел из канала "${botChannel.name}" (никого не осталось)`
      );
    }
  }
});

// ---------------- TEXT COMMANDS ----------------
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Команда просмотра своей карточки
  if (message.content.toLowerCase() === "!mycard") {
    const card = userCards.get(message.author.id);
    if (!card) {
      return message.reply(
        "У тебя пока нет карточки. Зайди в канал 'бункер', чтобы её получить!"
      );
    }

    message.reply(
      `Вот твоя карточка персонажа:\n` +
        `**${card.name}**\n` +
        `Сила: ${card.power}\n` +
        `Навык: ${card.skill}`
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
