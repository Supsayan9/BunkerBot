require("dotenv").config();
const fetch = require("node-fetch");
const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

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

// ---------------- READY ----------------
client.once(Events.ClientReady, () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
});

// ---------------- Генерация карточки ----------------
async function generateBunkerCard(userId) {
  const prompt = `
Создай уникального персонажа для игры "Бункер" (3-е издание).
Карточка должна быть в формате JSON с полями:
- Профессия
- Здоровье
- Хобби
- Факт
- Биология
- Особые Условия
- Рюкзак (массив предметов)
- Дополнительное сведение
- Спец. возможность

Персонаж должен быть полезен для выживания и иметь интересные черты.
Не добавляй ничего вне JSON.
`;

  try {
    const response = await fetch("https://api.apifree.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.APIFREE_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-5.2",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        stream: false,
      }),
    });

    const data = await response.json();
    let text = data.choices?.[0]?.message?.content || "";
    text = text.replace(/```json|```/g, "").trim();

    try {
      return JSON.parse(text);
    } catch (err) {
      console.error("❌ Ошибка парсинга JSON от GPT 5.2:", text);
      return { error: true, raw: text };
    }
  } catch (err) {
    console.error("❌ Ошибка при генерации карточки:", err);
    return { error: true };
  }
}

// ---------------- Выдача карточки ----------------
async function giveBunkerCard(user) {
  if (!user || !user.id) return;
  if (userCards.has(user.id) || pendingUsers.has(user.id)) return;

  pendingUsers.add(user.id);
  const card = await generateBunkerCard(user.id);
  pendingUsers.delete(user.id);

  if (card.error) {
    try {
      await user.send("❌ Не удалось создать карточку. Попробуй позже.");
    } catch {}
    return;
  }

  userCards.set(user.id, card);

  const backpack = Array.isArray(card.Рюкзак)
    ? card.Рюкзак.join("\n")
    : card.Рюкзак || "–";

  const embed = new EmbedBuilder()
    .setTitle("🎴 Карточка персонажа")
    .setColor("#FF4500")
    .setThumbnail(`https://avatars.dicebear.com/api/bottts/${user.id}.png`)
    .addFields(
      { name: "⚒ Профессия", value: card.Профессия || "–", inline: true },
      { name: "❤️ Здоровье", value: card.Здоровье || "–", inline: true },
      { name: "🎲 Хобби", value: card.Хобби || "–", inline: true },
      { name: "📖 Факт", value: card.Факт || "–", inline: false },
      { name: "🧬 Биология", value: card.Биология || "–", inline: true },
      {
        name: "⭐ Особые Условия",
        value: card["Особые Условия"] || "–",
        inline: true,
      },
      { name: "🎒 Рюкзак", value: backpack, inline: false },
      {
        name: "📝 Дополнительное сведение",
        value: card["Дополнительное сведение"] || "–",
        inline: false,
      },
      {
        name: "✨ Спец. возможность",
        value: card["Спец. возможность"] || "–",
        inline: false,
      }
    );

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
      flags: 64, // ephemeral
    });
  }

  if (pendingUsers.has(interaction.user.id)) {
    return interaction.reply({
      content: "⌛ Карточка формируется, подожди немного...",
      flags: 64,
    });
  }

  await giveBunkerCard(interaction.user);

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
    try {
      await interaction.followUp({
        content: "✅ Карточка отправлена в личные сообщения.",
        components: [disabledRow],
        flags: 64,
      });
    } catch {}
  }
});

// ---------------- Логин ----------------
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("❌ Не удалось подключиться к Discord:", err);
});
