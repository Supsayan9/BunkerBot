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
const fetch = require("node-fetch");

// ---------------- Проверка токенов ----------------
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN не найден в .env");
  process.exit(1);
}
if (!process.env.APIFREE_KEY) {
  console.error("❌ APIFREE_KEY не найден в .env");
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

// ---------------- Состояние пользователей ----------------
const userCards = new Map();
const greetedUsers = new Set();
const pendingUsers = new Set();

// ---------------- Апокалипсис ----------------
let currentApocalypse = "";

// Функция выбора апокалипсиса для сессии
function chooseApocalypse() {
  const types = [
    "Глобальная ядерная война",
    "Зомби-апокалипсис",
    "Пандемия неизвестного вируса",
    "Климатическая катастрофа",
    "Экономический коллапс",
  ];
  currentApocalypse = types[Math.floor(Math.random() * types.length)];
  console.log("🌍 Апокалипсис этой сессии:", currentApocalypse);
}

// ---------------- READY ----------------
client.once(Events.ClientReady, () => {
  chooseApocalypse();
  console.log(`✅ Бот запущен как ${client.user.tag}`);
});

// ---------------- Генерация карточки ----------------
async function generateAICard(userId) {
  const prompt = `
Создай уникальную карточку персонажа для игры "Бункер Онлайн".
Все параметры должны быть структурированы и разнообразны, в формате JSON:
- Пол
- Телосложение
- Человеческая черта
- Профессия
- Здоровье
- Хобби / Увлечение
- Фобия / Страх
- Крупный инвентарь
- Рюкзак (массив предметов)
- Дополнительное сведение
- Спец. возможность

Добавь поле:
- Апокалипсис: "${currentApocalypse}"

Не добавляй лишнего текста вне JSON.
`;

  try {
    const res = await fetch("https://api.apifree.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.APIFREE_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-5.2",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
        stream: false,
      }),
    });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";

    try {
      return JSON.parse(text);
    } catch {
      console.error("❌ Ошибка парсинга JSON от GPT 5.2:", text);
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

  const backpack = Array.isArray(card.Рюкзак)
    ? card.Рюкзак.join(", ")
    : String(card.Рюкзак || "–");

  const embedContent = `
🎴 **Карточка персонажа для Бункера Онлайн**
🌍 Апокалипсис: **${card.Апокалипсис || currentApocalypse}**
👤 Пол: **${card.Пол || "–"}**
💪 Телосложение: **${card.Телосложение || "–"}**
🧠 Черта: **${card["Человеческая черта"] || "–"}**
⚒ Профессия: **${card.Профессия || "–"}**
❤️ Здоровье: **${card.Здоровье || "–"}**
🎲 Хобби/Увлечение: **${card["Хобби / Увлечение"] || "–"}**
💀 Фобия/Страх: **${card["Фобия / Страх"] || "–"}**
🎒 Крупный инвентарь: **${card["Крупный инвентарь"] || "–"}**
👜 Рюкзак: **${backpack}**
📝 Доп. сведения: **${card["Дополнительное сведение"] || "–"}**
✨ Спец. возможность: **${card["Спец. возможность"] || "–"}**
`;

  try {
    await user.send({ content: embedContent });
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
      flags: 64, // ephemeral
    });
  }

  if (pendingUsers.has(interaction.user.id)) {
    return interaction.reply({
      content: "⌛ Карточка формируется, подожди немного...",
      flags: 64,
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

  try {
    await interaction.update({
      content: "✅ Карточка отправлена в личные сообщения.",
      components: [disabledRow],
    });
  } catch (err) {
    console.error("❌ Ошибка при обновлении кнопки:", err);
    // Если interaction устарела, ничего страшного — карточка уже отправлена
  }
});

// ---------------- Логин ----------------
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("❌ Не удалось подключиться к Discord:", err);
});
