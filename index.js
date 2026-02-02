require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Events,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { joinVoiceChannel } = require("@discordjs/voice");

// Создаем клиента Discord с нужными намерениями
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
  partials: ["CHANNEL"], // нужно для работы с DM
});

const connections = new Map(); // Подключения к голосовым каналам
const userCards = new Map(); // Карточки игроков
const buttonPressed = new Set(); // Пользователи, которые уже нажали кнопку

// ---------------- Шаблоны карточек ----------------
const cardsTemplates = [
  { name: "Выживший", power: 5, skill: "Скрытность" },
  { name: "Инженер", power: 3, skill: "Создание ловушек" },
  { name: "Доктор", power: 4, skill: "Исцеление" },
  { name: "Разведчик", power: 2, skill: "Быстрое передвижение" },
];

// ---------------- READY ----------------
client.once(Events.ClientReady, () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
});

// ---------------- ФУНКЦИЯ ВЫДАЧИ КАРТОЧКИ ----------------
async function assignCardAndSendDM(member) {
  if (userCards.has(member.id)) return; // Если карточка уже есть, ничего не делаем

  const card =
    cardsTemplates[Math.floor(Math.random() * cardsTemplates.length)];

  const avatarUrl = `https://avatars.dicebear.com/api/bottts/${encodeURIComponent(
    member.id
  )}.png`;

  userCards.set(member.id, { ...card, avatar: avatarUrl });

  try {
    const attachment = new AttachmentBuilder(avatarUrl, { name: "card.png" });
    const dmChannel = await member.createDM();
    await dmChannel.send({
      content:
        `Привет, ${member.displayName}! 🏰\n` +
        `Твоя карточка персонажа:\n**${card.name}**\nСила: ${card.power}\nНавык: ${card.skill}`,
      files: [attachment],
    });
    console.log(`✅ Отправлено приветствие и карточка ${member.user.tag}`);
  } catch (err) {
    console.log(`❌ Ошибка при выдаче карточки ${member.user.tag}: ${err}`);
  }
}

// ---------------- VOICE STATE UPDATE ----------------
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

  // Пользователь заходит в канал "Бункер"
  if (
    (!oldChannel || oldChannel.id !== newChannel?.id) &&
    newChannel?.name.toLowerCase() === "бункер"
  ) {
    const guildId = newChannel.guild.id;

    // Подключение бота к голосовому каналу
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

    // Отправляем приветствие с кнопкой только если пользователь ещё не получил карточку
    if (!userCards.has(member.id)) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("start_game")
          .setLabel("Начать игру 🎮")
          .setStyle(ButtonStyle.Primary)
      );

      try {
        const dmChannel = await member.createDM();
        await dmChannel.send({
          content: `Привет, ${member.displayName}! Добро пожаловать в Бункер! 🏰\nНажми кнопку ниже, чтобы получить свою карточку персонажа.`,
          components: [row],
        });
      } catch (err) {
        console.log(`❌ Не удалось отправить DM ${member.user.tag}: ${err}`);
      }
    }
  }

  // Авто-выход бота из канала, если никого не осталось
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

// ---------------- ОБРАБОТКА КНОПКИ ----------------
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "start_game") {
    if (buttonPressed.has(interaction.user.id)) {
      return interaction.reply({
        content: "❌ Вы уже получили свою карточку!",
        ephemeral: true,
      });
    }

    await interaction.deferUpdate(); // Подтверждаем обработку кнопки

    // Добавляем пользователя в Set
    buttonPressed.add(interaction.user.id);

    // Генерируем карточку
    const dmMember = interaction.user;
    await assignCardAndSendDM(dmMember);

    // Делаем кнопку неактивной
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("start_game")
        .setLabel("Начать игру 🎮")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true)
    );

    await interaction.editReply({
      content: "✅ Твоя карточка была отправлена в личные сообщения!",
      components: [disabledRow],
    });
  }
});

// ---------------- TEXT COMMANDS ----------------
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (message.content.toLowerCase() === "!mycard") {
    const card = userCards.get(message.author.id);
    if (!card) {
      return message.reply(
        "У тебя пока нет карточки. Зайди в канал 'бункер', чтобы её получить!"
      );
    }

    const attachment = new AttachmentBuilder(card.avatar, { name: "card.png" });
    message.reply({
      content: `Вот твоя карточка персонажа:\n**${card.name}**\nСила: ${card.power}\nНавык: ${card.skill}`,
      files: [attachment],
    });
  }
});

// ---------------- LOGIN ----------------
client.login(process.env.DISCORD_TOKEN);
