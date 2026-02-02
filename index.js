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
if (!process.env.OPENROUTER_API_KEY) {
  console.error("❌ OPENROUTER_API_KEY не найден в .env");
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
let currentApocalypse = null;

// ---------------- READY ----------------
client.once(Events.ClientReady, () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
  // Назначаем апокалипсис для сессии
  const apocalypseList = [
    "Глобальная ядерная война",
    "Зомби-апокалипсис",
    "Эпидемия неизвестного вируса",
    "Падение метеорита",
    "Экологическая катастрофа",
  ];
  currentApocalypse =
    apocalypseList[Math.floor(Math.random() * apocalypseList.length)];
  console.log(`🌍 Апокалипсис этой сессии: ${currentApocalypse}`);
});

// ---------------- Генерация карточки ----------------
async function generateAICard(userId) {
  const prompt = `
Создай уникальную карточку персонажа для игры "Бункер Онлайн".
Апокалипсис должен быть одинаковый для всех игроков.
Карточка должна быть в формате JSON со следующими полями:
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
- Апокалипсис

Сделай персонажа интересным, с разнообразными чертами и увлекательной историей. 
Не добавляй лишнего текста вне JSON.
`;

  try {
    const response = await fetch("https://api.apifree.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-5.2",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4096,
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    try {
      const jsonCard = JSON.parse(text);
      // На случай, если апокалипсис не пришёл от модели
      if (!jsonCard.Апокалипсис) {
        jsonCard.Апокалипсис = currentApocalypse;
      }
      return jsonCard;
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
    ? card.Рюкзак.join("\n")
    : String(card.Рюкзак || "–");

  const embed = new EmbedBuilder()
    .setTitle("🎴 Карточка персонажа для Бункера Онлайн")
    .setColor(0x1abc9c)
    .addFields(
      { name: "🌍 Апокалипсис", value: card.Апокалипсис, inline: true },
      { name: "👤 Пол", value: card.Пол || "–", inline: true },
      {
        name: "💪 Телосложение",
        value: card.Телосложение || "–",
        inline: true,
      },
      {
        name: "🧠 Черта",
        value: card["Человеческая черта"] || "–",
        inline: false,
      },
      { name: "⚒ Профессия", value: card.Профессия || "–", inline: true },
      { name: "❤️ Здоровье", value: card.Здоровье || "–", inline: true },
      {
        name: "🎲 Хобби/Увлечение",
        value: card["Хобби / Увлечение"] || "–",
        inline: false,
      },
      {
        name: "💀 Фобия/Страх",
        value: card["Фобия / Страх"] || "–",
        inline: false,
      },
      {
        name: "🎒 Крупный инвентарь",
        value: card["Крупный инвентарь"] || "–",
        inline: false,
      },
      { name: "👜 Рюкзак", value: backpack || "–", inline: false },
      {
        name: "📝 Доп. сведения",
        value: card["Дополнительное сведение"] || "–",
        inline: false,
      },
      {
        name: "✨ Спец. возможность",
        value: card["Спец. возможность"] || "–",
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
      flags: 64, // заменяем deprecated ephemeral
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
    console.error(
      `❌ Не удалось обновить кнопку для ${interaction.user.id}:`,
      err
    );
  }
});

// ---------------- Логин ----------------
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("❌ Не удалось подключиться к Discord:", err);
});
