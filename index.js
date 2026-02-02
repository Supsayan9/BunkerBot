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

// ---------------- Инициализация ----------------
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

// ---------------- Генерация карточки ----------------
async function generatePlayerCard() {
  const prompt = `
Ты создаёшь персонажа для игры "Бункер Онлайн".

Апокалипсис: "${currentApocalypse}"

Сгенерируй ОДНУ карточку игрока.

Правила:
- Возраст: ТОЛЬКО число от 10 до 100
- В каждом пункте строго ОДНО условие
- Никаких "—", "нет", "отсутствует"

ФОРМАТ СТРОГО ТАКОЙ (НЕ МЕНЯЙ):

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
      temperature: 1.15,
      max_tokens: 900,
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || null;
}

// ---------------- Выдача карточки ----------------
async function giveCard(user) {
  if (userCards.has(user.id) || pendingUsers.has(user.id)) return;

  pendingUsers.add(user.id);
  const text = await generatePlayerCard();
  pendingUsers.delete(user.id);

  if (!text) {
    await user.send("❌ Ошибка генерации карточки.");
    return;
  }

  userCards.set(user.id, true);
  const blocks = text.split("\n\n");

  const embed = new EmbedBuilder()
    .setTitle("🎴 ПЕРСОНАЖ В БУНКЕРЕ")
    .setDescription(
      `━━━━━━━━━━━━━━━━━━\n` +
        `🌍 **АПОКАЛИПСИС**\n` +
        `**${currentApocalypse}**\n` +
        `━━━━━━━━━━━━━━━━━━`
    )
    .setColor(0x8e44ad)
    .addFields(
      { name: "🃏 Профессия", value: blocks[1], inline: true },
      { name: "❤️ Здоровье", value: blocks[3], inline: true },
      { name: "🧬 Биология", value: blocks[5], inline: false },
      { name: "🎲 Хобби", value: blocks[7], inline: true },
      { name: "💀 Фобия", value: blocks[9], inline: true },
      { name: "📎 Информация", value: blocks[11], inline: false },
      { name: "🧠 Качества", value: blocks[13], inline: false },
      { name: "🟣 Спец-условие I", value: blocks[15], inline: false },
      { name: "🟣 Спец-условие II", value: blocks[17], inline: false }
    )
    .setFooter({
      text: "Бункер Онлайн • Каждое решение — на вес жизни",
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
        "🏰 **Ты вошёл в Бункер.**\n\nНажми кнопку, чтобы узнать свою судьбу.",
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
      content: "❌ Карта уже получена.",
      ephemeral: true,
    });
  }

  await interaction.reply({
    content: "⌛ Судьба формируется...",
    ephemeral: true,
  });
  await giveCard(interaction.user);
  await interaction.editReply({
    content: "✅ Карточка отправлена в личные сообщения.",
  });
});

// ---------------- Логин ----------------
client.login(process.env.DISCORD_TOKEN);
