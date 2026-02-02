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
const fetch = require("node-fetch"); // npm install node-fetch

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const userCards = new Map(); // Хранение карточек
const greetedUsers = new Set(); // Чтобы приветствие отправлялось 1 раз

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// ---------------- READY ----------------
client.once(Events.ClientReady, () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
});

// ---------------- ФУНКЦИЯ ГЕНЕРАЦИИ AI-КАРТОЧКИ ----------------
async function generateAICard(userId) {
  const prompt = `
Ты — ведущий психологической игры "Бункер".
Сгенерируй уникальную карточку персонажа для игрока.

Верни строго JSON:

{
  "profession": "",
  "age": number,
  "health": "",
  "phobia": "",
  "skill": "",
  "hobby": "",
  "trait": "",
  "secret": "",
  "usefulness": "",
  "conflict": ""
}
`;

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-r1",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.8,
        }),
      }
    );

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "{}";

    return JSON.parse(text);
  } catch (err) {
    console.error(
      "❌ OpenRouter error, использую запасную карточку:",
      err.message
    );
    // fallback
    return {
      profession: "Выживший",
      age: 30,
      health: "Нормальное",
      phobia: "Ни одной",
      skill: "Адаптация",
      hobby: "Наблюдение",
      trait: "Хладнокровный",
      secret: "Не раскрывает страхи",
      usefulness: "Средняя",
      conflict: "Низкий",
    };
  }
}

// ---------------- ФУНКЦИЯ ВЫДАЧИ КАРТОЧКИ ----------------
async function giveCard(user) {
  if (!user || !user.id) return;
  if (userCards.has(user.id)) return;

  const card = await generateAICard(user.id);
  userCards.set(user.id, card);

  const avatar = `https://avatars.dicebear.com/api/bottts/${user.id}.png`;
  const file = new AttachmentBuilder(avatar, { name: "card.png" });

  try {
    const dm = await user.createDM();
    await dm.send({
      content:
        `🎴 **Твоя карточка персонажа**\n\n` +
        `👤 Роль: **${card.profession}**\n` +
        `💪 Сила: **${card.skill}**\n` +
        `🧠 Навык: **${card.trait}**\n` +
        `🎯 Полезность: **${card.usefulness}**\n` +
        `⚔ Конфликт: **${card.conflict}**\n` +
        `💀 Страх: **${card.phobia}**\n` +
        `🎲 Хобби: **${card.hobby}**\n` +
        `🧾 Секрет: **${card.secret}**`,
      files: [file],
    });
  } catch {
    console.log(`❌ Не удалось отправить DM пользователю ${user.id}`);
  }
}

// ---------------- ВХОД В КАНАЛ ----------------
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
          "🏰 **Добро пожаловать в Бункер**\n\n" +
          "Нажми кнопку ниже, чтобы получить свою уникальную карточку персонажа.",
        components: [row],
      });
    } catch {
      console.log(`❌ Не удалось отправить приветствие DM ${member.user.tag}`);
    }
  }
});

// ---------------- ОБРАБОТКА КНОПКИ ----------------
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== "get_card") return;

  if (userCards.has(interaction.user.id)) {
    return interaction.reply({
      content: "❌ У тебя уже есть карточка.",
      ephemeral: true,
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
    content: "✅ Твоя карточка была отправлена в личные сообщения!",
    components: [disabledRow],
  });
});

client.login(process.env.DISCORD_TOKEN);
