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
if (!process.env.PEXELS_KEY) {
  console.error("❌ PEXELS_KEY не найден в .env");
  process.exit(1);
}

// ---------------- Инициализация бота ----------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: ["CHANNEL"],
});

// ---------------- Состояние ----------------
const userCards = new Map();
const greetedUsers = new Set();
const pendingUsers = new Set();

// ---------------- Апокалипсис ----------------
let currentApocalypse = "";

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

// ---------------- Генерация ОДНОЙ карточки ----------------
async function generatePlayerCard() {
  const prompt = `
Ты — генератор персонажей для игры "Бункер Онлайн".

Апокалипсис: "${currentApocalypse}"

Сгенерируй ОДНУ карточку игрока.
ВСЕ пункты должны быть СЛУЧАЙНЫМИ и логичными для этого апокалипсиса.

Правила:
- Возраст строго число от 10 до 100
- В каждом пункте ТОЛЬКО ОДНО условие
- Никаких прочерков, "нет", "—"

Формат ВЫВОДА СТРОГО такой:

🃏 Карта 1 — Профессия
<текст>

🃏 Карта 2 — Здоровье
<текст>

🃏 Карта 3 — Биологические характеристики
<пол, возраст, физическая форма>

🃏 Карта 4 — Хобби
<текст>

🃏 Карта 5 — Фобия
<текст>

🃏 Карта 6 — Дополнительная информация
<текст>

🃏 Карта 7 — Человеческие качества
<текст>

🃏 Карта 8 — Специальное условие
<текст>

🃏 Карта 9 — Специальное условие
<текст>

Важно:
- Заголовок карты всегда ОТДЕЛЬНОЙ строкой
- Следующая строка содержит только текст карты
`;

  const res = await fetch("https://api.apifree.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.APIFREE_KEY}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-5.2",
      messages: [
        {
          role: "system",
          content:
            "Ты отвечаешь строго в формате карточек без лишних пояснений.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 1.1,
      max_tokens: 900,
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || null;
}

async function fetchPexelsPhoto(query) {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", "1");
  url.searchParams.set("orientation", "square");
  url.searchParams.set("size", "medium");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: process.env.PEXELS_KEY,
    },
  });

  if (!res.ok) return null;
  const data = await res.json();
  const photo = data?.photos?.[0];
  return photo?.src?.medium || null;
}

async function getCardImageUrl(sections) {
  const profession = sections.get("Профессия")?.[0] || "";
  const apocalypse = currentApocalypse || "";
  const bio = sections.get("Биологические характеристики")?.[0] || "";

  const queries = [
    `${profession}, portrait`,
    `${profession}`,
    `${apocalypse}`,
    `${bio}, portrait`,
    "survivor portrait",
  ];

  for (const q of queries) {
    const img = await fetchPexelsPhoto(q);
    if (img) return img;
  }

  return null;
}

function parseCardText(cardText) {
  const sections = new Map();
  const text = String(cardText || "").replace(/\r\n/g, "\n").trim();
  const lines = text.split("\n");
  const headerRegex =
    /^(?:\s*)(?:Карта|Карточка)\s*№?\s*\d+\s*[—–-]\s*(.+?)\s*$/i;

  let currentTitle = null;
  let buffer = [];

  const pushCurrent = () => {
    if (!currentTitle) return;
    const value = buffer.join("\n").trim();
    if (!sections.has(currentTitle)) sections.set(currentTitle, []);
    sections.get(currentTitle).push(value);
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/^[^Кк]*/, "").trim();
    const match = headerRegex.exec(line);
    if (match) {
      pushCurrent();
      currentTitle = match[1].trim().replace(/\*\*/g, "");
      buffer = [];
    } else if (currentTitle) {
      buffer.push(rawLine);
    }
  }

  pushCurrent();

  return sections;
}

function clampField(value) {
  if (!value) return "—";
  if (value.length <= 1000) return value;
  return `${value.slice(0, 1000)}…`;
}

// ---------------- Выдача карточки ----------------
async function giveCard(user) {
  if (userCards.has(user.id) || pendingUsers.has(user.id)) return;

  pendingUsers.add(user.id);
  const cardText = await generatePlayerCard();
  pendingUsers.delete(user.id);

  if (!cardText) {
    await user.send("❌ Не удалось создать карточку. Попробуй позже.");
    return;
  }

  userCards.set(user.id, true);

  const sections = parseCardText(cardText);
  const spec = sections.get("Специальное условие") || [];

  if (sections.size === 0) {
    const fallback = new EmbedBuilder()
      .setTitle("🎴 КАРТОЧКА ИГРОКА")
      .setDescription(
        `╔════════════════════╗\n` +
          `🌍 **АПОКАЛИПСИС** 🌍\n` +
          `**${currentApocalypse}**\n` +
          `╚════════════════════╝`
      )
      .setColor(0x9b59b6)
      .setThumbnail("https://i.imgur.com/7yUvePI.png")
      .addFields({
        name: "⚠️ Сырой текст",
        value: clampField(cardText),
        inline: false,
      })
      .setFooter({
        text: "Бункер Онлайн • Судьба человечества решается сейчас",
      })
      .setTimestamp();

    await user.send({ embeds: [fallback] });
    return;
  }

  const photoUrl = await getCardImageUrl(sections);

  const embed = new EmbedBuilder()
    .setTitle("🎴 КАРТОЧКА ИГРОКА")
    .setDescription(
      `╔════════════════════╗\n` +
        `🌍 **АПОКАЛИПСИС** 🌍\n` +
        `**${currentApocalypse}**\n` +
        `╚════════════════════╝`
    )
    .setColor(0x9b59b6)
    .setThumbnail("https://i.imgur.com/7yUvePI.png")
    .setImage(photoUrl || "https://i.imgur.com/7yUvePI.png")
    .addFields(
      {
        name: "🃏 Профессия",
        value: clampField(sections.get("Профессия")?.[0]),
        inline: true,
      },
      {
        name: "❤️ Здоровье",
        value: clampField(sections.get("Здоровье")?.[0]),
        inline: true,
      },
      {
        name: "🧬 Биологические характеристики",
        value: clampField(sections.get("Биологические характеристики")?.[0]),
        inline: false,
      },
      {
        name: "🎲 Хобби",
        value: clampField(sections.get("Хобби")?.[0]),
        inline: true,
      },
      {
        name: "💀 Фобия",
        value: clampField(sections.get("Фобия")?.[0]),
        inline: true,
      },
      {
        name: "📎 Дополнительная информация",
        value: clampField(sections.get("Дополнительная информация")?.[0]),
        inline: false,
      },
      {
        name: "🧠 Человеческие качества",
        value: clampField(sections.get("Человеческие качества")?.[0]),
        inline: false,
      },
      {
        name: "🟣 Специальное условие I",
        value: clampField(spec[0]),
        inline: false,
      },
      {
        name: "🟣 Специальное условие II",
        value: clampField(spec[1]),
        inline: false,
      }
    )
    .setFooter({
      text: "Бункер Онлайн • Судьба человечества решается сейчас",
    })
    .setTimestamp();

  await user.send({ embeds: [embed] });
}

// ---------------- Вход в голос ----------------
client.on(Events.VoiceStateUpdate, async (_, newState) => {
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

    await member.send({
      content:
        "🏰 **Добро пожаловать в Бункер Онлайн!**\n\nНажми кнопку, чтобы получить свою карточку.",
      components: [row],
    });
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

  await interaction.reply({
    content: "⌛ Карточка формируется...",
    ephemeral: true,
  });

  await giveCard(interaction.user);

  await interaction.editReply({
    content: "✅ Карточка отправлена в личные сообщения.",
  });
});

// ---------------- Логин ----------------
client.login(process.env.DISCORD_TOKEN);
