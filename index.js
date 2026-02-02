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

const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
});

const userCards = new Map();
const greetedUsers = new Set();

// ---------------- PROMPT БУНКЕРА ----------------
const BUNKER_PROMPT = `
Ты — ведущий психологической игры «Бункер».

Сгенерируй УНИКАЛЬНУЮ карточку персонажа для одного игрока.

Правила:
- Карточка реалистичная
- Полезная, но с изъянами
- Добавляй конфликтный потенциал
- Не повторяй роли

Верни ТОЛЬКО JSON:

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

// ---------------- READY ----------------
client.once(Events.ClientReady, () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
});

// ---------------- AI КАРТОЧКА ----------------
async function generateAICard() {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: BUNKER_PROMPT }],
    temperature: 0.9,
  });

  return JSON.parse(response.choices[0].message.content);
}

// ---------------- ВЫДАЧА КАРТОЧКИ ----------------
async function giveCard(user) {
  if (!user || !user.id) return;
  if (userCards.has(user.id)) return;

  const card = await generateAICard();
  userCards.set(user.id, card);

  const avatar = `https://avatars.dicebear.com/api/bottts/${user.id}.png`;
  const file = new AttachmentBuilder(avatar, { name: "card.png" });

  try {
    const dm = await user.createDM();
    await dm.send({
      content:
        `🎴 **ТВОЯ КАРТОЧКА (БУНКЕР)**\n\n` +
        `👤 Профессия: **${card.profession}**\n` +
        `🎂 Возраст: **${card.age}**\n` +
        `❤️ Здоровье: **${card.health}**\n` +
        `😨 Фобия: **${card.phobia}**\n` +
        `🧠 Навык: **${card.skill}**\n` +
        `🎯 Хобби: **${card.hobby}**\n` +
        `🧬 Черта: **${card.trait}**\n\n` +
        `🤫 **Секрет:** ${card.secret}\n\n` +
        `🛠 Польза: ${card.usefulness}\n` +
        `⚠️ Конфликт: ${card.conflict}`,
      files: [file],
    });
  } catch {
    // DM закрыты — игнор
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
          "Нажми кнопку ниже, чтобы получить уникальную карточку.",
        components: [row],
      });
    } catch {
      // DM закрыты
    }
  }
});

// ---------------- КНОПКА ----------------
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== "get_card") return;

  if (userCards.has(interaction.user.id)) {
    return interaction.reply({
      content: "❌ Ты уже получил карточку.",
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
    content: "✅ Карточка отправлена в личные сообщения.",
    components: [disabledRow],
  });
});

client.login(process.env.DISCORD_TOKEN);
