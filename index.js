require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");
const { OpenAI } = require("openai");

// ---------------- Проверка токенов ----------------
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN не найден в .env");
  process.exit(1);
}
if (!process.env.OPENROUTER_API_KEY) {
  console.error("❌ OPENROUTER_API_KEY не найден в .env");
  process.exit(1);
}

// ---------------- Инициализация бота ----------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: ["CHANNEL"], // нужно для DM
});

// ---------------- OpenRouter ----------------
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ---------------- Состояние ----------------
const userCards = new Map();
const greetedUsers = new Set();
const pendingUsers = new Set();

// ---------------- READY ----------------
client.once(Events.ClientReady, () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
});

// ---------------- Генерация карточки ----------------
async function generateAICard() {
  const prompt = `
Создай уникальную карточку персонажа для игры "Бункер".
Формат: JSON
Поля:
name - имя/роль персонажа
power - сила 1-5
skill - основной навык
utility - полезность в игре
conflict - возможный конфликт
fear - страх
hobby - хобби
secret - секрет
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.choices?.[0]?.message?.content || "";
    let card;
    try {
      card = JSON.parse(text);
    } catch {
      card = { error: true, raw: text };
    }
    return card;
  } catch (err) {
    console.error("❌ Ошибка генерации карточки:", err);
    return { error: true };
  }
}

// ---------------- Выдача карточки ----------------
async function giveCard(user) {
  if (!user || !user.id) return;
  if (userCards.has(user.id) || pendingUsers.has(user.id)) return;

  pendingUsers.add(user.id);

  const card = await generateAICard();
  pendingUsers.delete(user.id);

  if (card.error) {
    try {
      await user.send("❌ Не удалось создать карточку. Попробуй позже.");
    } catch {}
    return;
  }

  userCards.set(user.id, card);

  const avatar = `https://avatars.dicebear.com/api/bottts/${user.id}.png`;
  const file = new AttachmentBuilder(avatar, { name: "card.png" });

  try {
    await user.send({
      content:
        `🎴 **Твоя карточка персонажа**\n\n` +
        `👤 Роль: **${card.name || "–"}**\n` +
        `💪 Сила: **${card.power || "–"}**\n` +
        `🧠 Навык: **${card.skill || "–"}**\n` +
        `🎯 Полезность: **${card.utility || "–"}**\n` +
        `⚔ Конфликт: **${card.conflict || "–"}**\n` +
        `💀 Страх: **${card.fear || "–"}**\n` +
        `🎲 Хобби: **${card.hobby || "–"}**\n` +
        `🧾 Секрет: **${card.secret || "–"}**`,
      files: [file],
    });
  } catch (err) {
    console.error(`❌ Не удалось отправить DM пользователю ${user.id}:`, err);
  }
}

// ---------------- Вход в канал ----------------
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member;
  if (!member || member.user.bot) return;

  if (
    newState.channel &&
    newState.channel.name.toLowerCase() === "бункер" &&
    !greetedUsers.has(member.id)
  ) {
    greetedUsers.add(member.id);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("get_card")
        .setLabel("Получить карточку 🎴")
        .setStyle(ButtonStyle.Primary)
    );

    try {
      await member.send({
        content:
          "🏰 **Добро пожаловать в Бункер**\n\n" +
          "Нажми кнопку ниже, чтобы получить свою уникальную карточку.",
        components: [row],
      });
      console.log(`📩 Отправлено DM пользователю ${member.id}`);
    } catch (err) {
      console.error(
        `❌ Не удалось отправить DM пользователю ${member.id}:`,
        err
      );
    }
  }
});

// ---------------- Кнопка ----------------
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== "get_card") return;

  if (userCards.has(interaction.user.id)) {
    return interaction.reply({
      content: "❌ У тебя уже есть карточка.",
      ephemeral: true,
    });
  }

  if (pendingUsers.has(interaction.user.id)) {
    return interaction.reply({
      content: "⌛ Карточка формируется, подожди немного...",
      ephemeral: true,
    });
  }

  await giveCard(interaction.user);

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("get_card")
      .setLabel("Карточка получена ✅")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  await interaction.update({
    content: "✅ Карточка отправлена в личные сообщения.",
    components: [disabledRow],
  });
});

// ---------------- Логин ----------------
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("❌ Не удалось подключиться к Discord:", err);
});
