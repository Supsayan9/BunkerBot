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

// ---------------- Генерация карточки через ИИ ----------------
async function generateAICard(userId) {
  const prompt = `
Создай уникальную карточку персонажа для игры "Бункер Онлайн" строго в формате JSON.
В JSON должны быть поля: Пол, Телосложение, Человеческая черта, Профессия, Здоровье, Хобби / Увлечение, Фобия / Страх, Крупный инвентарь, Рюкзак, Дополнительное сведение, Спец. возможность.
⚠️ Учитывай тип апокалипсиса "${currentApocalypse}" при выборе профессии, предметов, здоровья и способностей.
Добавь эмодзи к предметам в рюкзаке и крупном инвентаре.
Возраст генерируется в коде (от 10 до 100).
Здоровье — объект с параметрами (например "Иммунитет", "Выносливость").
Выводи **только JSON**, без пояснений, текста и кавычек вокруг JSON.
Добавь поле:
- "Апокалипсис": "${currentApocalypse}"
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
      }),
    });

    const data = await res.json();
    let text = data.choices?.[0]?.message?.content || "";

    // Вырезаем JSON из текста на всякий случай
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error("❌ Не удалось найти JSON в ответе GPT:", text);
      return { error: true, raw: text };
    }

    let card = JSON.parse(match[0]);

    // Если здоровье вернулось как объект, конвертируем в строку
    if (typeof card.Здоровье === "object" && card.Здоровье !== null) {
      card.Здоровье = Object.entries(card.Здоровье)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
    }

    // Генерируем возраст рандомно от 10 до 100
    card.Возраст = Math.floor(Math.random() * 91) + 10;

    return card;
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

  // Рюкзак и крупный инвентарь с эмодзи
  const backpack = Array.isArray(card.Рюкзак)
    ? card.Рюкзак.map((item) => `• ${item}`).join("\n")
    : String(card.Рюкзак || "–");

  const largeInventory = Array.isArray(card["Крупный инвентарь"])
    ? card["Крупный инвентарь"].map((item) => `• ${item}`).join("\n")
    : String(card["Крупный инвентарь"] || "–");

  const embed = new EmbedBuilder()
    .setTitle("🎴 Карточка персонажа")
    .setColor(0x1abc9c)
    .setDescription(
      `🌍 Апокалипсис: **${card.Апокалипсис || currentApocalypse}**`
    )
    .addFields(
      { name: "👤 Пол", value: String(card.Пол || "–"), inline: true },
      {
        name: "💪 Телосложение",
        value: String(card.Телосложение || "–"),
        inline: true,
      },
      { name: "🎂 Возраст", value: String(card.Возраст || "–"), inline: true },
      {
        name: "🧠 Черта",
        value: String(card["Человеческая черта"] || "–"),
        inline: false,
      },
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
        name: "🎲 Хобби / Увлечение",
        value: String(card["Хобби / Увлечение"] || "–"),
        inline: false,
      },
      {
        name: "💀 Фобия / Страх",
        value: String(card["Фобия / Страх"] || "–"),
        inline: false,
      },
      { name: "🎒 Крупный инвентарь", value: largeInventory, inline: false },
      { name: "👜 Рюкзак", value: backpack, inline: false },
      {
        name: "📝 Доп. сведения",
        value: String(card["Дополнительное сведение"] || "–"),
        inline: false,
      },
      {
        name: "✨ Спец. возможность",
        value: String(card["Спец. возможность"] || "–"),
        inline: false,
      }
    )
    .setFooter({ text: "Бункер Онлайн | Желаем выжить!" });

  try {
    await user.send({ embeds: [embed] });
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

  await interaction.reply({
    content: "⌛ Карточка формируется, подождите немного...",
    ephemeral: true,
  });

  await giveCard(interaction.user);

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("get_card")
      .setLabel("Карточка получена ✅")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  try {
    if (interaction.message) {
      await interaction.message.edit({ components: [disabledRow] });
    }
    await interaction.editReply({
      content: "✅ Карточка отправлена в личные сообщения.",
    });
  } catch (err) {
    console.error("❌ Ошибка при обновлении кнопки:", err);
  }
});

// ---------------- Логин ----------------
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("❌ Не удалось подключиться к Discord:", err);
});
