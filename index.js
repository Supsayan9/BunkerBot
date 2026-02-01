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
    GatewayIntentBits.DirectMessages,
  ],
  partials: ["CHANNEL"], // Важно для DM, чтобы interaction в DM работал
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

  const avatarUrl = `https://avatars.dicebear.com/api/bottts/${encodeURIComponent(
    user.id
  )}.png`;

  userCards.set(user.id, { ...card, avatar: avatarUrl });

  try {
    const attachment = new AttachmentBuilder(avatarUrl, { name: "card.png" });
    await user.send({
      content: `🎉 Твоя карточка персонажа:\n**${card.name}**\nСила: ${card.power}\nНавык: ${card.skill}`,
      files: [attachment],
    });
    console.log(`✅ Карточка отправлена в DM ${user.tag}`);
  } catch (err) {
    console.log(`❌ Не удалось отправить DM ${user.tag}: ${err}`);
  }
}

// ---------------- КНОПКА В DM ----------------
async function sendWelcomeWithButton(user) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("start_game")
      .setLabel("Начать игру 🎮")
      .setStyle(ButtonStyle.Primary)
  );

  try {
    await user.send({
      content: `Привет! 🏰 Добро пожаловать в Бункер! Нажми кнопку ниже, чтобы получить карточку персонажа.`,
      components: [row],
    });
  } catch (err) {
    console.log(`❌ Не удалось отправить приветствие DM ${user.tag}: ${err}`);
  }
}

// ---------------- ОБРАБОТКА КНОПКИ ----------------
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== "start_game") return;

  await interaction.deferUpdate(); // подтверждаем обработку кнопки
  await assignCardAndSendDM(interaction.user);

  await interaction.followUp({
    content: "✅ Карточка отправлена в твоё личное сообщение!",
    ephemeral: true,
  });
});

// ---------------- ТЕСТОВАЯ КОМАНДА ----------------
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (message.content.toLowerCase() === "!start") {
    await sendWelcomeWithButton(message.author);
    message.reply("✅ Приветствие и кнопка отправлены в DM!");
  }

  if (message.content.toLowerCase() === "!mycard") {
    const card = userCards.get(message.author.id);
    if (!card) {
      return message.reply(
        "У тебя пока нет карточки. Нажми кнопку 'Начать игру' в DM!"
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
