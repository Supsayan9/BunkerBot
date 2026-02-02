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

// ---------- Проверка ----------
if (!process.env.DISCORD_TOKEN || !process.env.APIFREE_KEY) {
  console.error("❌ Проверь .env (DISCORD_TOKEN / APIFREE_KEY)");
  process.exit(1);
}

// ---------- Бот ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: ["CHANNEL"],
});

const userCards = new Map();
const greetedUsers = new Set();
const pendingUsers = new Set();

// ---------- Апокалипсис ----------
let currentApocalypse = "";
function chooseApocalypse() {
  const list = [
    "Глобальная ядерная война",
    "Зомби-апокалипсис",
    "Пандемия неизвестного вируса",
    "Климатическая катастрофа",
    "Экономический коллапс",
  ];
  currentApocalypse = list[Math.floor(Math.random() * list.length)];
  console.log("🌍 Апокалипсис:", currentApocalypse);
}

// ---------- READY ----------
client.once(Events.ClientReady, () => {
  chooseApocalypse();
  console.log(`✅ ${client.user.tag} запущен`);
});

// ---------- Генерация ----------
async function generatePlayerCard() {
  const prompt = `
Ты — генератор карточек для игры "Бункер Онлайн".

Апокалипсис: "${currentApocalypse}"

Сгенерируй ОДНУ карточку игрока.

Правила:
- Всё строго случайно
- Возраст: число от 10 до 100
- В каждом пункте ТОЛЬКО одно условие
- Никаких "—", "нет", пустых значений

Формат СТРОГО:

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
`;

  const res = await fetch("https://api.apifree.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.APIFREE_KEY}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-5.2",
      messages: [{ role: "user", content: prompt }],
      temperature: 1.2,
      max_tokens: 900,
    }),
  });

  const data = await res.json();
  return data?.choices?.[0]?.message?.content;
}

// ---------- Парсер ----------
function parseCard(text) {
  const get = (title) => {
    const regex = new RegExp(`${title}\\n([\\s\\S]*?)(?=\\n🃏|$)`);
    return text.match(regex)?.[1]?.trim();
  };

  return {
    profession: get("Карта 1 — Профессия"),
    health: get("Карта 2 — Здоровье"),
    bio: get("Карта 3 — Биологические характеристики"),
    hobby: get("Карта 4 — Хобби"),
    fear: get("Карта 5 — Фобия"),
    info: get("Карта 6 — Дополнительная информация"),
    traits: get("Карта 7 — Человеческие качества"),
    spec1: get("Карта 8 — Специальное условие"),
    spec2: get("Карта 9 — Специальное условие"),
  };
}

// ---------- Отправка ----------
async function giveCard(user) {
  if (userCards.has(user.id) || pendingUsers.has(user.id)) return;

  pendingUsers.add(user.id);
  const raw = await generatePlayerCard();
  pendingUsers.delete(user.id);

  if (!raw) {
    return user.send("❌ Ошибка генерации карточки.");
  }

  const card = parseCard(raw);
  userCards.set(user.id, true);

  const embed = new EmbedBuilder()
    .setTitle("🎴 КАРТОЧКА ИГРОКА")
    .setDescription(`🌍 **Апокалипсис:**\n**${currentApocalypse}**`)
    .setColor(0x8e44ad)
    .addFields(
      { name: "🃏 Профессия", value: card.profession },
      { name: "❤️ Здоровье", value: card.health },
      { name: "🧬 Биологические характеристики", value: card.bio },
      { name: "🎲 Хобби", value: card.hobby },
      { name: "💀 Фобия", value: card.fear },
      { name: "📎 Доп. информация", value: card.info },
      { name: "🧠 Человеческие качества", value: card.traits },
      { name: "🟣 Спец. условие I", value: card.spec1 },
      { name: "🟣 Спец. условие II", value: card.spec2 }
    )
    .setFooter({ text: "Бункер Онлайн • Выживет сильнейший" })
    .setTimestamp();

  await user.send({ embeds: [embed] });
}

// ---------- Голос ----------
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
      content: "🏰 **Добро пожаловать в Бункер Онлайн**",
      components: [row],
    });
  }
});

// ---------- Кнопка ----------
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== "get_card") return;

  if (userCards.has(interaction.user.id)) {
    return interaction.reply({
      content: "❌ Карточка уже выдана.",
      flags: 64,
    });
  }

  await interaction.reply({
    content: "⌛ Генерируем судьбу...",
    flags: 64,
  });

  await giveCard(interaction.user);
  await interaction.editReply({ content: "✅ Карточка отправлена в ЛС." });
});

// ---------- Логин ----------
client.login(process.env.DISCORD_TOKEN);
