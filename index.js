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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const userCards = new Map(); // Хранение готовых карточек
const greetedUsers = new Set(); // Чтобы не слать кнопку дважды
const pendingUsers = new Set(); // Чтобы не делать несколько запросов к API одновременно

// ---------------- OpenRouter ----------------
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY, // ключ OpenRouter
});

// ---------------- READY ----------------
client.once(Events.ClientReady, () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
});

// ---------------- ФУНКЦИЯ ДЛЯ ГЕНЕРАЦИИ КАРТОЧКИ ----------------
async function generateAICard(userId) {
  try {
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

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.choices[0].message.content;

    // Попытка распарсить JSON
    let cardData = {};
    try {
      cardData = JSON.parse(text);
    } catch {
      cardData = { error: true, raw: text };
    }

    return cardData;
  } catch (err) {
    console.error("❌ Ошибка при генерации карточки:", err);
    return { error: true };
  }
}

// ---------------- ВЫДАЧА КАРТОЧКИ ----------------
async function giveCard(user) {
  if (!user || !user.id) return;
  if (userCards.has(user.id)) return;
  if (pendingUsers.has(user.id)) return; // Уже в процессе

  pendingUsers.add(user.id); // Блокируем пользователя

  const card = await generateAICard(user.id);

  pendingUsers.delete(user.id); // Снимаем блокировку

  if (card.error) {
    try {
      await user.send("❌ Не удалось создать карточку. Попробуй позже.");
    } catch {}
    return;
  }

  userCards.set(user.id, card);

  // Для аватара используем DiceBear PNG
  const avatar = `https://avatars.dicebear.com/api/bottts/${user.id}.png`;
  const file = new AttachmentBuilder(avatar, { name: "card.png" });

  try {
    const dm = await user.createDM();
    await dm.send({
      content:
        `🎴 **Твоя карточка персонажа**\n\n` +
        `👤 Роль: **${card.name}**\n` +
        `💪 Сила: **${card.power}**\n` +
        `🧠 Навык: **${card.skill}**\n` +
        `🎯 Полезность: **${card.utility || "–"}**\n` +
        `⚔ Конфликт: **${card.conflict || "–"}**\n` +
        `💀 Страх: **${card.fear || "–"}**\n` +
        `🎲 Хобби: **${card.hobby || "–"}**\n` +
        `🧾 Секрет: **${card.secret || "–"}**`,
      files: [file],
    });
  } catch (err) {
    console.log(`❌ Не удалось отправить DM ${user.id}:`, err);
  }
}

// ---------------- ВХОД В КАНАЛ ----------------
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
    } catch {}
  }
});

// ---------------- ОБРАБОТКА КНОПКИ ----------------
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

  // Деактивируем кнопку
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

client.login(process.env.DISCORD_TOKEN);
