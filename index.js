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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
});

const userCards = new Map();

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
async function assignCardAndSendDM(user) {
  if (userCards.has(user.id)) return;

  const card =
    cardsTemplates[Math.floor(Math.random() * cardsTemplates.length)];

  // PNG аватар DiceBear
  const avatarUrl = `https://avatars.dicebear.com/api/bottts/${encodeURIComponent(
    user.id
  )}.png`;

  userCards.set(user.id, { ...card, avatar: avatarUrl });

  try {
    const attachment = new AttachmentBuilder(avatarUrl, { name: "card.png" });

    await user.send({
      content: `Привет! 🏰\nТвоя карточка персонажа:\n**${card.name}**\nСила: ${card.power}\nНавык: ${card.skill}`,
      files: [attachment],
    });

    console.log(`✅ Карточка отправлена ${user.tag}`);
  } catch (err) {
    console.log(`❌ Ошибка отправки DM ${user.tag}: ${err}`);
  }
}

// ---------------- VOICE STATE UPDATE ----------------
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const newChannel = newState.channel;

  if (newChannel?.name.toLowerCase() === "бункер") {
    try {
      // Отправляем сообщение с кнопкой прямо в текстовый канал, связанный с голосовым
      const textChannel = newChannel.guild.channels.cache.find(
        (c) => c.isTextBased() && c.name.toLowerCase() === "general"
      );
      if (!textChannel) return;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("start_game")
          .setLabel("Начать игру 🎮")
          .setStyle(ButtonStyle.Primary)
      );

      await textChannel.send({
        content: `Привет, ${member.displayName}! Нажми кнопку ниже, чтобы получить карточку персонажа.`,
        components: [row],
      });
    } catch (err) {
      console.log(`❌ Ошибка отправки кнопки ${member.user.tag}: ${err}`);
    }
  }
});

// ---------------- ОБРАБОТКА КНОПКИ ----------------
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "start_game") {
    await interaction.deferUpdate();

    await assignCardAndSendDM(interaction.user);

    await interaction.followUp({
      content: "✅ Твоя карточка отправлена в личные сообщения!",
      ephemeral: true,
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
        "У тебя пока нет карточки. Нажми кнопку 'Начать игру' в канале."
      );
    }

    const attachment = new AttachmentBuilder(card.avatar, { name: "card.png" });
    message.reply({
      content: `Вот твоя карточка персонажа:\n**${card.name}**\nСила: ${card.power}\nНавык: ${card.skill}`,
      files: [attachment],
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
