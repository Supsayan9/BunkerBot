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
const apocalypses = [
  "Глобальная ядерная война",
  "Зомби-апокалипсис",
  "Экологическая катастрофа",
  "Глобальная пандемия",
  "Метеоритный дождь",
];
const currentApocalypse =
  apocalypses[Math.floor(Math.random() * apocalypses.length)];

// ---------------- READY ----------------
client.once(Events.ClientReady, () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
  console.log(`🌍 Апокалипсис этой сессии: ${currentApocalypse}`);
});

// ---------------- Генерация карточки ----------------
async function generateAICard(userId) {
  const prompt = `
Создай уникальную карточку персонажа для игры "Бункер Онлайн".
Апокалипсис: ${currentApocalypse}
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

Все поля должны быть заполнены и интересными. Не добавляй текст вне JSON.
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
        max_tokens: 2048,
      }),
    });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";

    try {
      const card = JSON.parse(text);
      card["Апокалипсис"] = currentApocalypse; // добавим поле
      return card;
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

  const embedContent = `
🎴 **Карточка персонажа для Бункера Онлайн**
🌍 Апокалипсис: **${card["Апокалипсис"]}**
👤 Пол: **${card.Пол}**
💪 Телосложение: **${card.Телосложение}**
🧠 Черта: **${card["Человеческая черта"]}**
⚒ Профессия: **${card.Профессия}**
❤️ Здоровье: **${card.Здоровье}**
🎲 Хобби/Увлечение: **${card["Хобби / Увлечение"]}**
💀 Фобия/Страх: **${card["Фобия / Страх"]}**
🎒 Крупный инвентарь: **${card["Крупный инвентарь"]}**
👜 Рюкзак: **${card.Рюкзак.join(", ")}**
📝 Доп. сведения: **${card["Дополнительное сведение"]}**
✨ Спец. возможность: **${card["Спец. возможность"]}**
`;

  try {
    await user.send(embedContent);
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
      flags: 64,
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

  await interaction.update({
    content: "✅ Карточка отправлена в личные сообщения.",
    components: [disabledRow],
  });
});

// ---------------- Логин ----------------
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("❌ Не удалось подключиться к Discord:", err);
});
