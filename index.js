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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
});

const userCards = new Map();
const greetedUsers = new Set();

// ---------------- КАРТОЧКИ ----------------
const cards = [
  { name: "Инженер", power: 4, skill: "Ловушки" },
  { name: "Доктор", power: 3, skill: "Лечение" },
  { name: "Разведчик", power: 2, skill: "Скрытность" },
  { name: "Военный", power: 5, skill: "Оружие" },
];

// ---------------- READY ----------------
client.once(Events.ClientReady, () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
});

// ---------------- ВЫДАЧА КАРТОЧКИ ----------------
async function giveCard(user) {
  if (!user || !user.id) return;
  if (userCards.has(user.id)) return;

  const card = cards[Math.floor(Math.random() * cards.length)];
  userCards.set(user.id, card);

  const avatar = `https://avatars.dicebear.com/api/bottts/${user.id}.png`;
  const file = new AttachmentBuilder(avatar, { name: "card.png" });

  try {
    const dm = await user.createDM();
    await dm.send({
      content:
        `🎴 **Твоя карточка персонажа**\n\n` +
        `👤 Роль: **${card.name}**\n` +
        `💪 Сила: **${card.power}**\n` +
        `🧠 Навык: **${card.skill}**`,
      files: [file],
    });
  } catch {
    // если DM закрыты — просто молча игнорим
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
          "Нажми кнопку ниже, чтобы получить свою карточку.",
        components: [row],
      });
    } catch {
      // DM закрыты — не критично
    }
  }
});

// ---------------- КНОПКА ----------------
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
    content: "✅ Карточка отправлена в личные сообщения.",
    components: [disabledRow],
  });
});

client.login(process.env.DISCORD_TOKEN);
