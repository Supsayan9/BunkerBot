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
if (!process.env.DISCORD_TOKEN || !process.env.APIFREE_KEY) {
  console.error("❌ Токены не найдены");
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
const userCards = new Set();
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
  console.log("🌍 Апокалипсис:", currentApocalypse);
}

client.once(Events.ClientReady, () => {
  chooseApocalypse();
  console.log(`✅ Бот запущен как ${client.user.tag}`);
});

// ---------------- Генерация карточки ----------------
async function generatePlayerCard() {
  const prompt = `
Ты создаёшь персонажа для игры "Бункер Онлайн".
Апокалипсис: "${currentApocalypse}"

Строгий формат:

🃏 Карта 1 — Профессия
<текст>

🃏 Карта 2 — Здоровье
<текст>

🃏 Карта 3 — Биологические характеристики
<пол, возраст (10–100), форма>

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
      temperature: 1.1,
      max_tokens: 900,
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || null;
}

// ---------------- Безопасное извлечение ----------------
function safe(blocks, index) {
  return blocks[index]?.slice(0, 1024) || "Неизвестно";
}

// ---------------- Выдача карточки ----------------
async function giveCard(user) {
  if (userCards.has(user.id) || pendingUsers.has(user.id)) return;

  pendingUsers.add(user.id);
  const text = await generatePlayerCard();
  pendingUsers.delete(user.id);

  if (!text) return user.send("❌ Ошибка генерации.");

  userCards.add(user.id);
  const blocks = text.split("\n\n");

  const embed = new EmbedBuilder()
    .setTitle("🎴 ПЕРСОНАЖ В БУНКЕРЕ")
    .setDescription(`🌍 **${currentApocalypse}**`)
    .setColor(0x8e44ad)
    .addFields(
      { name: "🃏 Профессия", value: safe(blocks, 1), inline: true },
      { name: "❤️ Здоровье", value: safe(blocks, 3), inline: true },
      { name: "🧬 Биология", value: safe(blocks, 5) },
      { name: "🎲 Хобби", value: safe(blocks, 7), inline: true },
      { name: "💀 Фобия", value: safe(blocks, 9), inline: true },
      { name: "📎 Информация", value: safe(blocks, 11) },
      { name: "🧠 Качества", value: safe(blocks, 13) },
      { name: "🟣 Спец-условие I", value: safe(blocks, 15) },
      { name: "🟣 Спец-условие II", value: safe(blocks, 17) }
    )
    .setFooter({ text: "Бункер Онлайн • Выживет не каждый" })
    .setTimestamp();

  await user.send({ embeds: [embed] });
}

// ---------------- Кнопка ----------------
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton() || interaction.customId !== "get_card") return;

  if (userCards.has(interaction.user.id)) {
    return interaction.reply({ content: "❌ Карта уже получена.", flags: 64 });
  }

  await interaction.reply({ content: "⌛ Генерация...", flags: 64 });
  await giveCard(interaction.user);
  await interaction.editReply("✅ Карточка отправлена в ЛС.");
});

// ---------------- Логин ----------------
client.login(process.env.DISCORD_TOKEN);
