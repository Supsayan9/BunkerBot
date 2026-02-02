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
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: ["CHANNEL"], // чтобы бот мог отправлять DM
});

// ---------------- OpenRouter ----------------
const openai = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY });

// ---------------- Состояние пользователей ----------------
const userCards = new Map();
const greetedUsers = new Set();
const pendingUsers = new Set();

// ---------------- READY ----------------
client.once(Events.ClientReady, () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
});

// ---------------- Генерация карточки ----------------
async function generateAICard(userId) {
  const prompt = `
Создай уникальную карточку персонажа для игры "Бункер Онлайн".
Карточка должна быть в формате JSON со следующими полями:
- Пол
- Телосложение
- Человеческая черта
- Профессия
- Здоровье
- Хобби / Увлечение
- Фобия / Страх
- Крупный инвентарь
- Рюкзак
- Дополнительное сведение
- Спец. возможность

Сделай персонажа интересным, с разнообразными чертами и увлекательной историей. 
Не добавляй лишнего текста вне JSON.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.choices?.[0]?.message?.content || "";
    try {
      return JSON.parse(text);
    } catch {
      console.error("❌ Ошибка парсинга JSON от OpenAI:", text);
      return { error: true, raw: text };
    }
  } catch (err) {
    console.error("❌ Ошибка при генерации карточки:", err);
    return { error: true };
  }
}

// ---------------- Выдача карточки ----------------
async function giveCard(user) {
  if (!user || !user.id) return;
  if (userCards.has(user.id) || pendingUsers.has(user.id)) return;

  pendingUsers.add(user.id);

  const card = await generateAICard(user.id);
  pendingUsers.delete(user.id);

  if (card.error) {
    try {
      await user.send("❌ Не удалось создать карточку. Попробуй позже.");
    } catch {}
    return;
  }

  userCards.set(user.id, card);

  const avatarUrl = `https://avatars.dicebear.com/api/bottts/${user.id}.png`;
  const file = new AttachmentBuilder(avatarUrl, { name: "card.png" });

  try {
    await user.send({
      content:
        `🎴 **Твоя карточка персонажа для Бункера Онлайн**\n\n` +
        `👤 Пол: **${card.Пол || "–"}**\n` +
        `💪 Телосложение: **${card.Телосложение || "–"}**\n` +
        `🧠 Человеческая черта: **${card["Человеческая черта"] || "–"}**\n` +
        `⚒ Профессия: **${card.Профессия || "–"}**\n` +
        `❤️ Здоровье: **${card.Здоровье || "–"}**\n` +
        `🎲 Хобби/Увлечение: **${card["Хобби / Увлечение"] || "–"}**\n` +
        `💀 Фобия/Страх: **${card["Фобия / Страх"] || "–"}**\n` +
        `🎒 Крупный инвентарь: **${card["Крупный инвентарь"] || "–"}**\n` +
        `👜 Рюкзак: **${card.Рюкзак || "–"}**\n` +
        `📝 Доп. сведения: **${card["Дополнительное сведение"] || "–"}**\n` +
        `✨ Спец. возможность: **${card["Спец. возможность"] || "–"}**`,
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
          "🏰 **Добро пожаловать в Бункер Онлайн!**\n\n" +
          "Нажми кнопку ниже, чтобы получить свою уникальную карточку персонажа.",
        components: [row],
      });
    } catch (err) {
      console.error(`❌ Не удалось отправить приветствие ${member.id}:`, err);
    }
  }
});

// ---------------- Обработка кнопки ----------------
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
