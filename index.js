require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
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
  partials: ["CHANNEL"],
});

// ---------------- Состояние пользователей ----------------
const userCards = new Map();
const greetedUsers = new Set();
const pendingUsers = new Set();

// ---------------- Апокалипсис ----------------
let currentApocalypse = "";

// ---------------- Выбор апокалипсиса ----------------
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

// ---------------- Генерация 9 карт для игрока ----------------
async function generatePlayerCards(userId) {
  const prompt = `
Создай **9 карт** для одного игрока в игре "Бункер Онлайн" строго в формате JSON.
Каждая карта должна содержать **только одно значение** для каждого поля:
- Профессия
- Здоровье
- Биологические характеристики
- Хобби
- Фобии
- Дополнительная информация
- Человеческие качества

2 карты — "Специальные условия" (например иммунитет игрока, окружение бункера)
⚠️ Учитывай тип апокалипсиса "${currentApocalypse}" при выборе профессии, здоровья и особенностей.
Возраст генерируется в коде (от 10 до 100).
Выводи **только JSON** в виде массива из 9 объектов, без текста, пояснений или массивов внутри полей.
Добавь поле "Апокалипсис": "${currentApocalypse}" ко всем картам.
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
        max_tokens: 1500,
      }),
    });

    const data = await res.json();
    let text = data.choices?.[0]?.message?.content || "";

    // Вырезаем JSON из текста на всякий случай
    const match = text.match(/\[([\s\S]*?)\]/);
    if (!match) {
      console.error("❌ Не удалось найти JSON в ответе GPT:", text);
      return { error: true, raw: text };
    }

    let cards = JSON.parse(match[0]);

    // Генерируем возраст для обычных карт
    for (let card of cards) {
      if (!card["Специальные условия"]) {
        card.Возраст = Math.floor(Math.random() * 91) + 10;

        // Если здоровье вернулось как объект, конвертируем в строку
        if (typeof card.Здоровье === "object" && card.Здоровье !== null) {
          card.Здоровье = Object.entries(card.Здоровье)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
        }
      }
    }

    // Перемешиваем карты
    cards = cards.sort(() => Math.random() - 0.5);

    return cards;
  } catch (err) {
    console.error("❌ Ошибка при генерации карточек игрока:", err);
    return { error: true };
  }
}

// ---------------- Выдача 9 карт игроку ----------------
async function giveCards(user) {
  if (!user || !user.id) return;
  if (userCards.has(user.id) || pendingUsers.has(user.id)) return;

  pendingUsers.add(user.id);
  const cards = await generatePlayerCards(user.id);
  pendingUsers.delete(user.id);

  if (cards.error) {
    try {
      await user.send("❌ Не удалось создать карты. Попробуй позже.");
    } catch {}
    return;
  }

  userCards.set(user.id, cards);

  // Отправляем каждую карту отдельным embed
  for (const card of cards) {
    const isSpecial = card["Специальные условия"];
    const embed = new EmbedBuilder()
      .setTitle(isSpecial ? "🃏 Специальная карта" : "🎴 Карточка персонажа")
      .setColor(0x1abc9c)
      .setDescription(
        `🌍 Апокалипсис: **${card.Апокалипсис || currentApocalypse}**`
      )
      .addFields(
        isSpecial
          ? [
              {
                name: "🃏 Специальные условия",
                value: String(card["Специальные условия"] || "–"),
                inline: false,
              },
            ]
          : [
              {
                name: "⚒ Профессия",
                value: String(card.Профессия || "–"),
                inline: true,
              },
              {
                name: "❤️ Здоровье",
                value: String(card.Здоровье || "–"),
                inline: true,
              },
              {
                name: "🧬 Биологические характеристики",
                value: String(card["Биологические характеристики"] || "–"),
                inline: false,
              },
              {
                name: "🎲 Хобби",
                value: String(card["Хобби"] || "–"),
                inline: false,
              },
              {
                name: "💀 Фобии",
                value: String(card["Фобии"] || "–"),
                inline: false,
              },
              {
                name: "📝 Дополнительная информация",
                value: String(card["Дополнительная информация"] || "–"),
                inline: false,
              },
              {
                name: "🧠 Человеческие качества",
                value: String(card["Человеческие качества"] || "–"),
                inline: false,
              },
              {
                name: "🎂 Возраст",
                value: String(card.Возраст || "–"),
                inline: true,
              },
            ]
      )
      .setFooter({ text: "Бункер Онлайн | Желаем выжить!" });

    try {
      await user.send({ embeds: [embed] });
    } catch (err) {
      console.error(`❌ Не удалось отправить DM пользователю ${user.id}:`, err);
    }
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
          "Нажми кнопку ниже, чтобы получить свои **9 карт персонажа**.",
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
      content: "❌ У тебя уже есть карты.",
      ephemeral: true,
    });
  }

  if (pendingUsers.has(interaction.user.id)) {
    return interaction.reply({
      content: "⌛ Карты формируются, подожди немного...",
      ephemeral: true,
    });
  }

  await interaction.reply({
    content: "⌛ Карты формируются, подождите немного...",
    ephemeral: true,
  });

  await giveCards(interaction.user);

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("get_card")
      .setLabel("Карты получены ✅")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  try {
    if (interaction.message) {
      await interaction.message.edit({ components: [disabledRow] });
    }
    await interaction.editReply({
      content: "✅ Все 9 карт отправлены в личные сообщения.",
    });
  } catch (err) {
    console.error("❌ Ошибка при обновлении кнопки:", err);
  }
});

// ---------------- Логин ----------------
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("❌ Не удалось подключиться к Discord:", err);
});
