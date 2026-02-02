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

// ---------------- Генерация одной карты с 9 условиями ----------------
// ---------------- Генерация простой карты с 9 условиями ----------------
async function generatePlayerCard(userId) {
  const prompt = `
Создай **одну карточку** для игрока в игре "Бункер Онлайн" строго в формате JSON.
Карточка должна содержать ровно 9 полей с **одним условием в каждом**:
- Профессия
- Болезнь
- Хобби
- Фобия
- Навык
- Специальное качество
- Любимое оружие
- Слабость
- Апокалипсис

Выводи **только JSON**, без текста и объяснений.
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
        max_tokens: 512,
      }),
    });

    const data = await res.json();
    let text = data.choices?.[0]?.message?.content || "";

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { error: true, raw: text };

    const card = JSON.parse(match[0]);
    return card;
  } catch (err) {
    console.error("❌ Ошибка при генерации карточки:", err);
    return { error: true };
  }
}

// ---------------- Выдача простой карты ----------------
async function giveCard(user) {
  if (!user || !user.id) return;
  if (userCards.has(user.id) || pendingUsers.has(user.id)) return;

  pendingUsers.add(user.id);
  const card = await generatePlayerCard(user.id);
  pendingUsers.delete(user.id);

  if (card.error) {
    try {
      await user.send("❌ Не удалось создать карточку. Попробуй позже.");
    } catch {}
    return;
  }

  userCards.set(user.id, card);

  const embed = new EmbedBuilder()
    .setTitle("🎴 Карточка персонажа")
    .setColor(0x1abc9c)
    .addFields(
      {
        name: "⚒ Профессия",
        value: String(card.Профессия || "–"),
        inline: true,
      },
      { name: "💉 Болезнь", value: String(card.Болезнь || "–"), inline: true },
      { name: "🎲 Хобби", value: String(card.Хобби || "–"), inline: true },
      { name: "💀 Фобия", value: String(card.Фобия || "–"), inline: true },
      { name: "🧠 Навык", value: String(card.Навык || "–"), inline: true },
      {
        name: "🌟 Специальное качество",
        value: String(card["Специальное качество"] || "–"),
        inline: true,
      },
      {
        name: "🔫 Любимое оружие",
        value: String(card["Любимое оружие"] || "–"),
        inline: true,
      },
      { name: "⚠ Слабость", value: String(card.Слабость || "–"), inline: true },
      {
        name: "🌍 Апокалипсис",
        value: String(card.Апокалипсис || "–"),
        inline: true,
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
          "Нажми кнопку ниже, чтобы получить **свою карточку с 9 условиями**.",
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
