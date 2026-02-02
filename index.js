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
const { joinVoiceChannel } = require("@discordjs/voice");
const fetch = require("node-fetch"); // Если Node 18+, fetch встроенный

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
});

const userCards = new Map();
const greetedUsers = new Set();
const connections = new Map();

// ---------------- READY ----------------
client.once(Events.ClientReady, () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
});

// ---------------- AI-КАРТОЧКА ----------------
async function generateAICard(userId) {
  const prompt = `
Ты — ведущий психологической игры "Бункер".
Сгенерируй уникальную карточку персонажа для игрока.
Верни строго JSON:
{
  "profession": "",
  "age": 0,
  "health": "",
  "phobia": "",
  "skill": "",
  "hobby": "",
  "trait": "",
  "secret": "",
  "usefulness": "",
  "conflict": ""
}`;

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
    let text = data?.choices?.[0]?.message?.content || "{}";

    // Чистим ```json ... ``` если есть
    if (text.startsWith("```")) {
      text = text
        .replace(/```json/, "")
        .replace(/```/, "")
        .trim();
    }

    const parsed = JSON.parse(text);

    return {
      profession: parsed.profession || "Выживший",
      age: parsed.age || 25,
      health: parsed.health || "Нормальное",
      phobia: parsed.phobia || "Ни одной",
      skill: parsed.skill || "Адаптация",
      hobby: parsed.hobby || "Наблюдение",
      trait: parsed.trait || "Хладнокровный",
      secret: parsed.secret || "Не раскрывает страхи",
      usefulness: parsed.usefulness || "Средняя",
      conflict: parsed.conflict || "Низкий",
    };
  } catch (err) {
    console.error(
      "❌ OpenRouter error, используем запасную карточку:",
      err.message
    );
    return {
      profession: "Выживший",
      age: 25,
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

// ---------------- ВЫДАЧА КАРТОЧКИ ----------------
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

// ---------------- ПОДКЛЮЧЕНИЕ КАНАЛ ----------------
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

  if (
    newChannel &&
    newChannel.name.toLowerCase() === "бункер" &&
    !greetedUsers.has(member.id)
  ) {
    greetedUsers.add(member.id);

    // Подключаемся к каналу
    try {
      if (!connections.has(newChannel.guild.id)) {
        const connection = joinVoiceChannel({
          channelId: newChannel.id,
          guildId: newChannel.guild.id,
          adapterCreator: newChannel.guild.voiceAdapterCreator,
        });
        connections.set(newChannel.guild.id, connection);
        console.log(`🔊 Бот подключился к каналу "${newChannel.name}"`);
      }
    } catch (err) {
      console.error("❌ Не удалось подключиться к каналу:", err);
    }

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
          "Нажми кнопку ниже, чтобы получить свою уникальную карточку.",
        components: [row],
      });
    } catch {
      console.log(`❌ Не удалось отправить DM ${member.user.tag}`);
    }
  }

  // Выход из канала, если никого не осталось
  const connection = connections.get(newState.guild.id);
  if (connection) {
    const botChannel = newState.guild.channels.cache.get(
      connection.joinConfig.channelId
    );
    if (!botChannel) return;

    const nonBotMembers = botChannel.members.filter((m) => !m.user.bot);
    if (nonBotMembers.size === 0) {
      connection.destroy();
      connections.delete(newState.guild.id);
      console.log(`🔌 Бот вышел из канала "${botChannel.name}"`);
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
    content: "✅ Твоя карточка отправлена в личные сообщения!",
    components: [disabledRow],
  });
});

client.login(process.env.DISCORD_TOKEN);
