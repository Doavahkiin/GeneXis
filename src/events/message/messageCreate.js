const Discord = require("discord.js");
const Functions = require("../../database/models/functions");
const afk = require("../../database/models/afk");
const chatBotSchema = require("../../database/models/chatbot-channel");
const messagesSchema = require("../../database/models/messages");
const messageSchema = require("../../database/models/levelMessages");
const messageRewards = require("../../database/models/messageRewards");
const Schema = require("../../database/models/stickymessages");
const levelRewards = require("../../database/models/levelRewards");
const levelLogs = require("../../database/models/levelChannels");
const Commands = require("../../database/models/customCommand");
const CommandsSchema = require("../../database/models/customCommandAdvanced");
const fetch = require("node-fetch");
const db = require("pro.db");

const groq = require("groq-sdk");
const { ai_prompt } = require("../../config/bot");
const Groq = new groq.Groq({
  apiKey: process.env.GROQ,
  defaultHeaders: {
    "Groq-Model-Version": "2025-11-11"
  }
})
/**
 * 
 * @param {Discord.Client} client 
 * @param {Discord.Message} message 
 * @returns 
 */
module.exports = async (client, message) => {
  const dmlog = new Discord.WebhookClient({
    id: client.webhooks.dmLogs.id,
    token: client.webhooks.dmLogs.token,
  });

  if (message.author.bot) return;

  if (message.channel.type === Discord.ChannelType.DM) {
    let embedLogs = new Discord.EmbedBuilder()
      .setTitle(`💬・New DM message!`)
      .setDescription(`Bot has received a new DM message!`)
      .addFields(
        { name: "👤┆Send By", value: `${message.author} (${message.author.tag})`, inline: true },
        { name: `💬┆Message`, value: `${message.content || "None"}`, inline: true },
      )
      .setColor(client.config.colors.normal)
      .setTimestamp();

    if (message.attachments.size > 0)
      embedLogs.addFields(
        { name: `📃┆Attachments`, value: `${message.attachments.first()?.url}`, inline: false },
      )
    return dmlog.send({
      username: "Bot DM",
      embeds: [embedLogs],
    });
  }

  // Levels
  Functions.findOne({ Guild: message.guild.id }, async (err, data) => {
    if (data) {
      if (data.Levels == true) {
        const randomXP = Math.floor(Math.random() * 9) + 1;
        const hasLeveledUp = await client.addXP(
          message.author.id,
          message.guild.id,
          randomXP
        );

        if (hasLeveledUp) {
          const user = await client.fetchLevels(
            message.author.id,
            message.guild.id
          );

          const levelData = await levelLogs.findOne({
            Guild: message.guild.id,
          });
          const messageData = await messageSchema.findOne({
            Guild: message.guild.id,
          });

          if (messageData) {
            var levelMessage = messageData.Message;
            levelMessage = levelMessage.replace(
              `{user:username}`,
              message.author.username
            );
            levelMessage = levelMessage.replace(
              `{user:discriminator}`,
              message.author.discriminator
            );
            levelMessage = levelMessage.replace(
              `{user:tag}`,
              message.author.tag
            );
            levelMessage = levelMessage.replace(
              `{user:mention}`,
              message.author
            );

            levelMessage = levelMessage.replace(`{user:level}`, user.level);
            levelMessage = levelMessage.replace(`{user:xp}`, user.xp);

            try {
              if (levelData) {
                await client.channels.cache
                  .get(levelData.Channel)
                  .send({ content: levelMessage })
                  .catch(() => { });
              } else {
                await message.channel.send({ content: levelMessage });
              }
            } catch {
              await message.channel.send({ content: levelMessage });
            }
          } else {
            try {
              if (levelData) {
                await client.channels.cache
                  .get(levelData.Channel)
                  .send({
                    content: `**GG** <@!${message.author.id}>, you are now level **${user.level}**`,
                  })
                  .catch(() => { });
              } else {
                message.channel.send({
                  content: `**GG** <@!${message.author.id}>, you are now level **${user.level}**`,
                });
              }
            } catch {
              message.channel.send({
                content: `**GG** <@!${message.author.id}>, you are now level **${user.level}**`,
              });
            }
          }

          levelRewards.findOne(
            { Guild: message.guild.id, Level: user.level },
            async (err, data) => {
              if (data) {
                message.guild.members.cache
                  .get(message.author.id)
                  .roles.add(data.Role)
                  .catch((e) => { });
              }
            }
          );
        }
      }
    }
  });

  // Message tracker system
  messagesSchema.findOne(
    { Guild: message.guild.id, User: message.author.id },
    async (err, data) => {
      if (data) {
        data.Messages += 1;
        data.save();

        messageRewards.findOne(
          { Guild: message.guild.id, Messages: data.Messages },
          async (err, data) => {
            if (data) {
              try {
                message.guild.members.cache
                  .get(message.author.id)
                  .roles.add(data.Role);
              } catch { }
            }
          }
        );
      } else {
        new messagesSchema({
          Guild: message.guild.id,
          User: message.author.id,
          Messages: 1,
        }).save();
      }
    }
  );

  // AFK system
  afk.findOne(
    { Guild: message.guild.id, User: message.author.id },
    async (err, data) => {
      if (data) {
        await afk.deleteOne({
          Guild: message.guild.id,
          User: message.author.id,
        });

        client
          .simpleEmbed(
            {
              desc: `${message.author} is no longer afk!`,
            },
            message.channel
          )
          .then(async (m) => {
            setTimeout(() => {
              m.delete();
            }, 5000);
          });

        if (message.member.displayName.startsWith(`[AFK] `)) {
          let name = message.member.displayName.replace(`[AFK] `, ``);
          message.member.setNickname(name).catch((e) => { });
        }
      }
    }
  );

  message.mentions.users.forEach(async (u) => {
    if (
      !message.content.includes("@here") &&
      !message.content.includes("@everyone")
    ) {
      afk.findOne(
        { Guild: message.guild.id, User: u.id },
        async (err, data) => {
          if (data) {
            client.simpleEmbed(
              { desc: `${u} is currently afk! **Reason:** ${data.Message}` },
              message.channel
            );
          }
        }
      );
    }
  });

// Chat bot
chatBotSchema.findOne({ Guild: message.guild.id }, async (err, data) => {
  if (!data) return;
  if (message.channel.id !== data.Channel) return;
  
  // Prevent bot from responding to itself
  if (message.author.bot) return;
  
  // Add typing indicator
  message.channel.sendTyping().catch(() => {});
  
  // Configuration
  const MAX_HISTORY = 20;
  const DISCORD_MAX_CHARS = 2000;
  const TRUNCATE_THRESHOLD = 1950;
  
  if (process.env.GROQ) {
    try {
      Groq.apiKey = process.env.GROQ;
      const key = `chat:${message.guild.id}:${message.author.id}`;
      
      // Get or initialize chat history
      const userChat = db.get(key) || [];
      
      // Add user message to history
      const messages = [
        ...userChat,
        {
          role: "user",
          content: message.cleanContent
        }
      ];
      
      // Prepare system prompt
      const systemPrompt = ai_prompt ?? "You are a helpful assistant.";
      
      // Call Groq API
      const response = await Groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          ...messages.slice(-MAX_HISTORY) // Limit context window
        ],
        model: "groq/compound",
        temperature: 1,
        max_tokens: 8192,
      });
      
      console.log("Groq API Response:", response); // Debug log
      
      let res = response.choices?.[0]?.message?.content || "No response generated.";
      console.log("Extracted response:", res); // Debug log
      
      // Add assistant response to history
      messages.push({
        role: "assistant",
        content: res
      });
      
      // Save history (limit to last MAX_HISTORY messages)
      db.set(key, messages.slice(-MAX_HISTORY));
      
      // Send the response
      await sendMessage(message, res, TRUNCATE_THRESHOLD);
      
    } catch (error) {
      console.error("Groq API Error:", error);
      
      // Send error message to user
      const errorMessage = `Sorry, I encountered an error: ${error.message}`;
      await message.reply({
        content: errorMessage.slice(0, DISCORD_MAX_CHARS),
        failIfNotExists: false
      }).catch(console.error);
    }
  } else {
    // Fallback to external API
    try {
      const response = await fetch(
        `https://api.coreware.nl/fun/chat?msg=${encodeURIComponent(message.cleanContent)}&uid=${message.author.id}`
      );
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const json = await response.json();
      console.log("Fallback API Response:", json); // Debug log
      
      if (json?.response && json.response.trim().length > 0) {
        await sendMessage(message, json.response, TRUNCATE_THRESHOLD);
      } else {
        await message.reply({
          content: "I couldn't generate a response right now.",
          failIfNotExists: false
        }).catch(console.error);
      }
    } catch (error) {
      console.error("Fallback API Error:", error);
      await message.reply({
        content: "Sorry, I'm having trouble responding right now.",
        failIfNotExists: false
      }).catch(console.error);
    }
  }
});

/**
 * Sends a message, splitting it if necessary
 * @param {Message} originalMessage - The original Discord message
 * @param {string} content - The content to send
 * @param {number} chunkSize - Maximum characters per chunk (default 1950)
 */
async function sendMessage(originalMessage, content, chunkSize = 1950) {
  console.log("sendMessage called with content:", content ? `"${content.substring(0, 50)}..."` : "null/undefined"); // Debug log
  
  // Check if content is valid
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    console.log("Content is empty or invalid, sending fallback message");
    await originalMessage.reply({
      content: "I couldn't generate a response. Please try again.",
      failIfNotExists: false
    }).catch(console.error);
    return;
  }
  
  // Trim the content
  content = content.trim();
  
  // If content is short enough, send it directly
  if (content.length <= chunkSize) {
    try {
      await originalMessage.reply({
        content: content,
        failIfNotExists: false
      });
    } catch (error) {
      console.error("Failed to send message:", error);
      await originalMessage.reply({
        content: "Error sending response.",
        failIfNotExists: false
      }).catch(console.error);
    }
    return;
  }
  
  // Split and send if too long
  const chunks = splitMessage(content, chunkSize);
  console.log(`Split message into ${chunks.length} chunks`); // Debug log
  
  // Send first chunk as a reply
  try {
    await originalMessage.reply({
      content: chunks[0],
      failIfNotExists: false
    });
  } catch (error) {
    console.error("Failed to send first chunk:", error);
    return;
  }
  
  // Send remaining chunks as follow-up messages
  for (let i = 1; i < chunks.length; i++) {
    try {
      await originalMessage.channel.send({
        content: chunks[i],
        reply: { messageReference: originalMessage.id, failIfNotExists: false }
      });
      // Add small delay to avoid rate limiting
      if (i < chunks.length - 1) await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Failed to send chunk ${i}:`, error);
      break;
    }
  }
}

/**
 * Splits a string into chunks of specified size
 * @param {string} str - The string to split
 * @param {number} chunkSize - Maximum size of each chunk
 * @returns {string[]} Array of string chunks
 */
function splitMessage(str, chunkSize) {
  // Validate input
  if (!str || str.length <= chunkSize) {
    return [str];
  }
  
  const chunks = [];
  const paragraphs = str.split('\n\n');
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    // Calculate new chunk length if we add this paragraph
    const newChunkLength = currentChunk.length + (currentChunk ? '\n\n'.length : 0) + paragraph.length;
    
    if (newChunkLength > chunkSize) {
      // If current chunk has content, save it
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      
      // If paragraph itself is too long, split it further
      if (paragraph.length > chunkSize) {
        const lines = paragraph.split('\n');
        for (const line of lines) {
          if (currentChunk.length + line.length + 1 > chunkSize) {
            if (currentChunk) {
              chunks.push(currentChunk);
              currentChunk = '';
            }
            
            // If line is still too long, split by words
            if (line.length > chunkSize) {
              const words = line.split(' ');
              for (const word of words) {
                if (currentChunk.length + word.length + 1 > chunkSize) {
                  if (currentChunk) {
                    chunks.push(currentChunk);
                    currentChunk = '';
                  }
                }
                currentChunk += (currentChunk ? ' ' : '') + word;
              }
            } else {
              currentChunk = line;
            }
          } else {
            currentChunk += (currentChunk ? '\n' : '') + line;
          }
        }
      } else {
        currentChunk = paragraph;
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }
  
  // Add the last chunk if it exists
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}
  // Sticky messages
  try {
    Schema.findOne(
      { Guild: message.guild.id, Channel: message.channel.id },
      async (err, data) => {
        if (!data) return;

        const lastStickyMessage = await message.channel.messages
          .fetch(data.LastMessage)
          .catch(() => { });
        if (!lastStickyMessage) return;
        await lastStickyMessage.delete({ timeout: 1000 });

        const newMessage = await client.simpleEmbed(
          { desc: `${data.Content}` },
          message.channel
        );

        data.LastMessage = newMessage.id;
        data.save();
      }
    );
  } catch { }

  // Prefix
  var guildSettings = await Functions.findOne({ Guild: message.guild.id });
  if (!guildSettings) {
    new Functions({
      Guild: message.guild.id,
      Prefix: client.config.discord.prefix,
    }).save();

    guildSettings = await Functions.findOne({ Guild: message.guild.id });
  }

  if (!guildSettings || !guildSettings.Prefix) {
    Functions.findOne({ Guild: message.guild.id }, async (err, data) => {
      data.Prefix = client.config.discord.prefix;
      data.save();
    });

    guildSettings = await Functions.findOne({ Guild: message.guild.id });
  }

  if (!guildSettings || !guildSettings.Prefix) {
    var prefix = client.config.Discord.prefix;
  } else {
    var prefix = guildSettings.Prefix;
  }

  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefixRegex = new RegExp(
    `^(<@!?${client.user.id}>|${escapeRegex(prefix)})\\s*`
  );

  if (!prefixRegex.test(message.content.toLowerCase())) return;
  const [, matchedPrefix] = message.content.toLowerCase().match(prefixRegex);

  const args = message.content.slice(matchedPrefix.length).trim().split(/ +/g);
  const command = args.shift().toLowerCase();

  if (
    message.mentions.users.first() &&
    message.mentions.users.first().id == client.user.id &&
    command.length === 0
  ) {
    let row = new Discord.ActionRowBuilder().addComponents(
      new Discord.ButtonBuilder()
        .setLabel("Invite")
        .setURL(
          client.config.discord.botInvite
        )
        .setStyle(Discord.ButtonStyle.Link),

      new Discord.ButtonBuilder()
        .setLabel("Support server")
        .setURL(client.config.discord.serverInvite)
        .setStyle(Discord.ButtonStyle.Link)
    );

    client
      .embed(
        {
          title: "Hi, i'm Bot",
          desc: `Use with commands via Discord ${client.emotes.normal.slash} commands`,
          fields: [
            {
              name: "📨┆Invite me",
              value: `Invite Bot in your own server! [Click here](${client.config.discord.botInvite})`,
            },
            {
              name: "❓┇I don't see any slash commands",
              value:
                "The bot may not have permissions for this. Open the invite link again and select your server. The bot then gets the correct permissions",
            },
            {
              name: "❓┆Need support?",
              value: `For questions you can join our [support server](${client.config.discord.serverInvite})!`,
            },
            {
              name: "🐞┆Found a bug?",
              value: `Report all bugs via: \`/report bug\`!`,
            },
          ],
          components: [row],
        },
        message.channel
      )
      .catch(() => { });
  }

  const cmd = await Commands.findOne({
    Guild: message.guild.id,
    Name: command,
  });
  if (cmd) {
    return message.channel.send({ content: cmdx.Responce });
  }

  const cmdx = await CommandsSchema.findOne({
    Guild: message.guild.id,
    Name: command,
  });
  if (cmdx) {
    if (cmdx.Action == "Normal") {
      return message.channel.send({ content: cmdx.Responce });
    } else if (cmdx.Action == "Embed") {
      return client.simpleEmbed(
        {
          desc: `${cmdx.Responce}`,
        },
        message.channel
      );
    } else if (cmdx.Action == "DM") {
      return message.author.send({ content: cmdx.Responce }).catch((e) => {
        client.errNormal(
          {
            error: "I can't DM you, maybe you have DM turned off!",
          },
          message.channel
        );
      });
    }
  }
};


