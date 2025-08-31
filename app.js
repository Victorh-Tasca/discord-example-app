// app.js
import {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import 'dotenv/config';

// --- Configuração do Cliente ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// --- Armazenamento em Memória ---
const raffles = new Map();
const creationSessions = new Map();

client.once(Events.ClientReady, () => {
  console.log(`Bot logado como ${client.user.tag}!`);
});

// --- Funções Auxiliares ---
function createRaffleDashboard(sessionData) {
    const embed = new EmbedBuilder()
      .setColor(sessionData.color || '#5865F2')
      .setTitle('Painel de Criação de Rifa')
      .setDescription('Configure os detalhes da sua rifa. Esta mensagem será apagada ao publicar ou cancelar.')
      .addFields(
          { name: '📝 Título', value: sessionData.title || 'Não definido', inline: true },
          { name: '💰 Preço', value: sessionData.price ? `R$ ${sessionData.price.toFixed(2)}` : 'Não definido', inline: true },
          { name: '🎟️ Tickets', value: String(sessionData.maxTickets || 'Não definido'), inline: true },
          { name: '▶️ Início', value: sessionData.startTime ? `<t:${Math.floor(sessionData.startTime.getTime() / 1000)}:f>` : 'Não definido', inline: true },
          { name: '⏹️ Fim', value: sessionData.endTime ? `<t:${Math.floor(sessionData.endTime.getTime() / 1000)}:f>` : 'Não definido', inline: true },
          { name: '🎨 Cor', value: sessionData.color || 'Padrão', inline: true },
          { name: '🔑 Chave PIX', value: sessionData.pixKey || 'Não definida', inline: true },
          { name: '✨ Tipo de PIX', value: sessionData.pixKeyType || 'Não definido', inline: true },
          { name: '📢 Anúncio', value: sessionData.publishChannelId ? `<#${sessionData.publishChannelId}>` : 'Não definido', inline: true },
          { name: '📢 Logs', value: sessionData.logChannelId ? `<#${sessionData.logChannelId}>` : 'Não definido', inline: true },
          { name: '📄 Descrição', value: sessionData.description || 'Não definida' },
          { name: '🖼️ Imagem (URL)', value: sessionData.image || 'Nenhuma' }
      );
  
    const isReadyToPublish = sessionData.title && sessionData.description && sessionData.price && sessionData.maxTickets && sessionData.startTime && sessionData.endTime && sessionData.pixKey && sessionData.pixKeyType && sessionData.publishChannelId && sessionData.logChannelId;
  
    const buttons1 = new ActionRowBuilder().addComponents( new ButtonBuilder().setCustomId('set_title').setLabel('Título').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('set_description').setLabel('Descrição').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('set_price').setLabel('Preço').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('set_image').setLabel('Imagem').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('set_color').setLabel('Cor').setStyle(ButtonStyle.Secondary) );
    const buttons2 = new ActionRowBuilder().addComponents( new ButtonBuilder().setCustomId('set_maxTickets').setLabel('Tickets').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('set_startTime').setLabel('Início').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('set_endTime').setLabel('Fim').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('set_pixKey').setLabel('Chave PIX').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('set_pixKeyType').setLabel('Tipo PIX').setStyle(ButtonStyle.Secondary) );
    const buttons3 = new ActionRowBuilder().addComponents( new ButtonBuilder().setCustomId('set_publishChannel').setLabel('Canal Anúncio').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('set_logChannel').setLabel('Canal Logs').setStyle(ButtonStyle.Secondary) );
    const actions = new ActionRowBuilder().addComponents( new ButtonBuilder().setCustomId('publish_raffle').setLabel('Publicar Rifa').setStyle(ButtonStyle.Success).setDisabled(!isReadyToPublish), new ButtonBuilder().setCustomId('cancel_raffle').setLabel('Cancelar').setStyle(ButtonStyle.Danger) );
    
    return { embeds: [embed], components: [buttons1, buttons2, buttons3, actions] };
}

// --- Listener Principal de Interações ---
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'configurar_rifa') {
    if (!interaction.member.permissions.has('Administrator')) { return interaction.reply({ content: 'Você precisa ser um administrador.', ephemeral: true }); }
    const sessionId = interaction.user.id;
    const dashboard = createRaffleDashboard({});
    const panelMessage = await interaction.reply({ ...dashboard, fetchReply: true });
    creationSessions.set(sessionId, { panelMessageId: panelMessage.id });
  }

  if (interaction.isButton()) {
    const sessionId = interaction.user.id;
    const sessionData = creationSessions.get(sessionId);
    if (!sessionData && !interaction.customId.includes('_participate') && !interaction.customId.startsWith('approve_') && !interaction.customId.startsWith('refuse_')) return;

    const [action, field] = interaction.customId.split('_');

    switch (action) {
      case 'set':
        // ===================================================================
        // NOVA LÓGICA DE DATA/HORA USANDO MODAL
        // ===================================================================
        if (field === 'startTime' || field === 'endTime') {
            const modal = new ModalBuilder()
                .setCustomId(`datetime_modal_${field}`)
                .setTitle(`Definir Data e Hora de ${field === 'startTime' ? 'Início' : 'Fim'}`);

            const dayInput = new TextInputBuilder().setCustomId('day').setLabel("Dia (DD)").setStyle(TextInputStyle.Short).setPlaceholder('Ex: 01').setMinLength(2).setMaxLength(2).setRequired(true);
            const monthInput = new TextInputBuilder().setCustomId('month').setLabel("Mês (MM)").setStyle(TextInputStyle.Short).setPlaceholder('Ex: 09').setMinLength(2).setMaxLength(2).setRequired(true);
            const yearInput = new TextInputBuilder().setCustomId('year').setLabel("Ano (AAAA)").setStyle(TextInputStyle.Short).setPlaceholder('Ex: 2025').setMinLength(4).setMaxLength(4).setRequired(true);
            const hourInput = new TextInputBuilder().setCustomId('hour').setLabel("Hora (HH)").setStyle(TextInputStyle.Short).setPlaceholder('Ex: 19').setMinLength(2).setMaxLength(2).setRequired(true);
            const minuteInput = new TextInputBuilder().setCustomId('minute').setLabel("Minuto (MM)").setStyle(TextInputStyle.Short).setPlaceholder('Ex: 30').setMinLength(2).setMaxLength(2).setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(dayInput),
                new ActionRowBuilder().addComponents(monthInput),
                new ActionRowBuilder().addComponents(yearInput),
                new ActionRowBuilder().addComponents(hourInput),
                new ActionRowBuilder().addComponents(minuteInput)
            );

            await interaction.showModal(modal);
            return;
        }

        if (field === 'pixKeyType') {
            const selectMenu = new StringSelectMenuBuilder().setCustomId('select_pixtype').setPlaceholder('Selecione o tipo da Chave PIX').addOptions([ { label: 'CPF / CNPJ', value: 'CPF/CNPJ' }, { label: 'Celular', value: 'Celular' }, { label: 'E-mail', value: 'E-mail' }, { label: 'Chave Aleatória', value: 'Chave Aleatória' }, { label: 'QR Code (Apenas informativo)', value: 'QR Code' } ]);
            await interaction.reply({ content: 'Por favor, selecione o tipo da sua chave PIX:', components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
            return;
        }
        const prompts = { title: 'Qual o título da rifa?', description: 'Qual a descrição?', price: 'Qual o preço por número? (Ex: 5.50)', image: 'Envie a URL da imagem.', color: 'Qual a cor da embed? (HEX, ex: #FF0000)', maxTickets: 'Qual a quantidade de tickets?', pixKey: 'Qual a Chave PIX?', publishChannel: 'Envie o ID do canal de anúncio.', logChannel: 'Envie o ID do canal de logs.', };
        await interaction.reply({ content: prompts[field], ephemeral: true });
        const filter = (msg) => msg.author.id === interaction.user.id;
        try {
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 120000, errors: ['time'] });
            const message = collected.first(); const content = message.content;
            if (field === 'price' || field === 'maxTickets') {
                const numValue = field === 'price' ? parseFloat(content) : parseInt(content);
                if (isNaN(numValue)) { throw new Error('Valor inválido.'); }
                sessionData[field] = numValue;
            } else if (field === 'color') {
                if (!/^#[0-9A-F]{6}$/i.test(content)) { throw new Error('Código de cor inválido.'); }
                sessionData.color = content.toUpperCase();
            } else if (field === 'logChannel') { sessionData.logChannelId = content; } 
            else if (field === 'publishChannel') { sessionData.publishChannelId = content; } 
            else { sessionData[field] = content; }
            await message.delete();
            const dashboard = createRaffleDashboard(sessionData);
            const panelMessage = await interaction.channel.messages.fetch(sessionData.panelMessageId);
            await panelMessage.edit(dashboard);
            await interaction.deleteReply();
        } catch (error) { await interaction.deleteReply().catch(err => {}); }
        break;

      case 'publish':
      case 'cancel':
        const finalAction = action;
        const panelMessageToDel = await interaction.channel.messages.fetch(sessionData.panelMessageId).catch(() => null);
        if (panelMessageToDel) await panelMessageToDel.delete();
        if (finalAction === 'publish') {
            const raffleId = `raffle_${Date.now()}`;
            const raffleData = { id: raffleId, ...sessionData, soldTickets: 0, creatorId: interaction.user.id, participants: new Map() };
            try {
              const publishChannel = await client.channels.fetch(raffleData.publishChannelId);
              const embed = new EmbedBuilder().setColor(raffleData.color || '#5865F2').setTitle(`🎉 Rifa: ${raffleData.title} 🎉`).setDescription(raffleData.description)
                .addFields( { name: '🎟️ Tickets Disponíveis', value: `${raffleData.soldTickets}/${raffleData.maxTickets}` }, { name: '💰 Preço por Ticket', value: `R$ ${raffleData.price.toFixed(2)}`}, { name: '▶️ Início', value: `<t:${Math.floor(raffleData.startTime.getTime() / 1000)}:f>` }, { name: '⏹️ Encerramento', value: `<t:${Math.floor(raffleData.endTime.getTime() / 1000)}:f>` }, { name: '🔑 Chave PIX', value: `**Tipo:** ${raffleData.pixKeyType}\n**Chave:** \`${raffleData.pixKey}\`` })
                .setImage(raffleData.image || null).setFooter({ text: `ID da Rifa: ${raffleId}` });
              const participateButton = new ButtonBuilder().setCustomId(`${raffleId}_participate`).setLabel('Quero Participar!').setStyle(ButtonStyle.Success);
              const row = new ActionRowBuilder().addComponents(participateButton);
              const raffleMessage = await publishChannel.send({ embeds: [embed], components: [row] });
              raffleData.messageId = raffleMessage.id;
              raffles.set(raffleId, raffleData);
              await interaction.reply({ content: `✅ Rifa publicada com sucesso em ${publishChannel}!`, ephemeral: true });
            } catch (error) { await interaction.reply({ content: `❌ Erro ao publicar: Verifique se os IDs dos canais estão corretos e se o bot tem permissão.`, ephemeral: true }); }
        } else { await interaction.reply({ content: 'Criação de rifa cancelada.', ephemeral: true }); }
        creationSessions.delete(sessionId);
        break;
    }
  }

  // ===================================================================
  // NOVO LISTENER PARA O ENVIO DO MODAL DE DATA/HORA
  // ===================================================================
  if (interaction.isModalSubmit() && interaction.customId.startsWith('datetime_modal_')) {
    const sessionId = interaction.user.id;
    const sessionData = creationSessions.get(sessionId);
    if (!sessionData) return;

    const targetField = interaction.customId.split('_')[2];

    try {
        const day = parseInt(interaction.fields.getTextInputValue('day'));
        const month = parseInt(interaction.fields.getTextInputValue('month'));
        const year = parseInt(interaction.fields.getTextInputValue('year'));
        const hour = parseInt(interaction.fields.getTextInputValue('hour'));
        const minute = parseInt(interaction.fields.getTextInputValue('minute'));
        
        // Validação simples
        if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hour) || isNaN(minute)) {
            throw new Error('Todos os campos devem ser números.');
        }

        const finalDate = new Date(year, month - 1, day, hour, minute);
        if (isNaN(finalDate.getTime())) { // Verifica se a data é válida
            throw new Error('A data inserida é inválida.');
        }

        sessionData[targetField] = finalDate;

        const dashboard = createRaffleDashboard(sessionData);
        const panelMessage = await interaction.channel.messages.fetch(sessionData.panelMessageId);
        await panelMessage.edit(dashboard);

        await interaction.reply({ content: `✅ Data de ${targetField === 'startTime' ? 'início' : 'fim'} definida com sucesso!`, ephemeral: true });

    } catch (error) {
        await interaction.reply({ content: `❌ Erro ao processar a data: ${error.message}`, ephemeral: true });
    }
  }


  if (interaction.isStringSelectMenu()) {
    const sessionId = interaction.user.id;
    const sessionData = creationSessions.get(sessionId);
    if (!sessionData) return;
    
    if (interaction.customId === 'select_pixtype') {
        sessionData.pixKeyType = interaction.values[0];
        const dashboard = createRaffleDashboard(sessionData);
        const panelMessage = await interaction.channel.messages.fetch(sessionData.panelMessageId);
        await panelMessage.edit(dashboard);
        await interaction.reply({ content: 'Tipo de PIX definido!', ephemeral: true });
        return;
    }
    
    if (interaction.customId.endsWith('_select_quantity')) {
        const raffleId = interaction.customId.replace('_select_quantity', '');
        const raffleData = raffles.get(raffleId);
        const quantity = parseInt(interaction.values[0]);
        if ((raffleData.soldTickets + quantity) > raffleData.maxTickets) { return interaction.reply({ content: `Não há tickets suficientes. Restam ${raffleData.maxTickets - raffleData.soldTickets}.` }); }
        const totalPrice = quantity * raffleData.price;
        raffleData.participants.set(interaction.user.id, { quantity, totalPrice, status: 'PENDING_PAYMENT' });
        await interaction.reply({ content: `Ótimo! Você selecionou **${quantity} número(s)**.\nO valor total é **R$ ${totalPrice.toFixed(2)}**.\n\n` + `**Tipo de PIX:** ${raffleData.pixKeyType}\n` + `**Chave PIX para pagamento:** \`${raffleData.pixKey}\`\n\n` + `Após o pagamento, **envie o comprovante (imagem) aqui nesta conversa**.` });
    }
  }

  // O resto do código permanece o mesmo
  if (interaction.isButton() && interaction.customId.endsWith('_participate')) {
    const raffleId = interaction.customId.replace('_participate', '');
    const raffleData = raffles.get(raffleId);
    if (!raffleData) return interaction.reply({ content: 'Esta rifa não está mais ativa.', ephemeral: true });
    const now = new Date();
    if (now < raffleData.startTime) { return interaction.reply({ content: `Esta rifa ainda não começou. Inicia em <t:${Math.floor(raffleData.startTime.getTime() / 1000)}:R>.`, ephemeral: true }); }
    if (now > raffleData.endTime) { return interaction.reply({ content: 'Esta rifa já foi encerrada.', ephemeral: true }); }
    if (raffleData.soldTickets >= raffleData.maxTickets) { return interaction.reply({ content: 'Que pena! Os tickets para esta rifa já se esgotaram.', ephemeral: true }); }
    try {
      const remainingTickets = raffleData.maxTickets - raffleData.soldTickets;
      const options = [ { label: '1 Número', value: '1' }, { label: '2 Números', value: '2' }, { label: '5 Números', value: '5' }, { label: '10 Números', value: '10' } ].filter(opt => parseInt(opt.value) <= remainingTickets);
      if (options.length === 0) { return interaction.reply({ content: 'Não há tickets suficientes para as opções padrão. Fale com um admin.', ephemeral: true }); }
      const selectMenu = new StringSelectMenuBuilder().setCustomId(`${raffleId}_select_quantity`).setPlaceholder('Selecione a quantidade de números').addOptions(options);
      const row = new ActionRowBuilder().addComponents(selectMenu);
      await interaction.user.send({ content: `Olá! Você está participando da rifa **"${raffleData.title}"**. Restam **${remainingTickets}** tickets.\n\nSelecione quantos números você deseja:`, components: [row] });
      await interaction.reply({ content: 'Enviei uma mensagem no seu privado para continuarmos!', ephemeral: true });
    } catch (error) {
      console.error('Falha ao enviar DM:', error);
      await interaction.reply({ content: 'Não consegui te enviar uma mensagem privada. Verifique suas configurações de privacidade.', ephemeral: true });
    }
  }
  if (interaction.isButton() && (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('refuse_'))) {
    const [action, raffleId, userId] = interaction.customId.split('_');
    const raffleData = raffles.get(raffleId);
    const participant = raffleData.participants.get(userId);
    if (!participant) return interaction.reply({ content: 'Participante não encontrado.', ephemeral: true });
    const user = await client.users.fetch(userId);
    const originalMessage = interaction.message;
    const disabledRow = new ActionRowBuilder().addComponents( ButtonBuilder.from(originalMessage.components[0].components[0]).setDisabled(true), ButtonBuilder.from(originalMessage.components[0].components[1]).setDisabled(true) );
    if (action === 'approve') {
      if ((raffleData.soldTickets + participant.quantity) > raffleData.maxTickets) {
          await interaction.update({ content: `❌ Não foi possível aprovar. A rifa ficaria com mais tickets que o limite. (Restantes: ${raffleData.maxTickets - raffleData.soldTickets})`, components: [disabledRow]});
          await user.send(`❌ Seu pagamento para a rifa **"${raffleData.title}"** não pôde ser aprovado pois os tickets se esgotaram. Contate a administração.`);
          return;
      }
      participant.status = 'CONFIRMED';
      raffleData.soldTickets += participant.quantity;
      try {
        if (raffleData.publishChannelId && raffleData.messageId) {
            const publishChannel = await client.channels.fetch(raffleData.publishChannelId);
            const raffleMessage = await publishChannel.messages.fetch(raffleData.messageId);
            if (raffleMessage) {
                const updatedEmbed = EmbedBuilder.from(raffleMessage.embeds[0]);
                const fieldIndex = updatedEmbed.data.fields.findIndex(f => f.name.includes('Tickets'));
                if (fieldIndex !== -1) { updatedEmbed.data.fields[fieldIndex].value = `${raffleData.soldTickets}/${raffleData.maxTickets}`; }
                await raffleMessage.edit({ embeds: [updatedEmbed] });
            }
        }
      } catch (err) { console.error("Não foi possível editar a mensagem da rifa:", err); }
      await user.send(`✅ Pagamento Aprovado!\n\nSua participação na rifa **"${raffleData.title}"** foi confirmada para **${participant.quantity} número(s)**. Boa sorte!`);
      await interaction.update({ content: `✅ Pagamento de ${user.tag} aprovado por ${interaction.user.tag}.`, embeds: originalMessage.embeds, components: [disabledRow]});
    } else {
      participant.status = 'REFUSED';
      await user.send(`❌ Pagamento Recusado.\n\nSua tentativa de participação na rifa **"${raffleData.title}"** foi recusada. Se acredita que isso é um erro, entre em contato.`);
      await interaction.update({ content: `❌ Pagamento de ${user.tag} recusado por ${interaction.user.tag}.`, embeds: originalMessage.embeds, components: [disabledRow]});
    }
  }
});
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || message.channel.type !== ChannelType.DM) return;
  let userRaffleId = null, userRaffleData = null;
  for (const [raffleId, raffleData] of raffles.entries()) {
    const participant = raffleData.participants.get(message.author.id);
    if (participant && participant.status === 'PENDING_PAYMENT') {
      userRaffleId = raffleId; userRaffleData = raffleData; break;
    }
  }
  if (!userRaffleId || !userRaffleData) return;
  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();
    const logChannel = await client.channels.fetch(userRaffleData.logChannelId);
    if (logChannel) {
      const participantData = userRaffleData.participants.get(message.author.id);
      const embed = new EmbedBuilder()
        .setTitle('Solicitação de Aprovação de Pagamento').setDescription(`O usuário **${message.author.tag}** (<@${message.author.id}>) enviou um comprovante para a rifa **"${raffleData.title}"**.`)
        .setColor('#f1c40f')
        .addFields( { name: 'Quantidade', value: `${participantData.quantity}`, inline: true }, { name: 'Valor Total', value: `R$ ${participantData.totalPrice.toFixed(2)}`, inline: true }, { name: 'ID da Rifa', value: `\`${userRaffleId}\``, inline: true } ).setImage(attachment.url).setTimestamp();
      const approveButton = new ButtonBuilder().setCustomId(`approve_${userRaffleId}_${message.author.id}`).setLabel('Aprovar').setStyle(ButtonStyle.Success);
      const refuseButton = new ButtonBuilder().setCustomId(`refuse_${userRaffleId}_${message.author.id}`).setLabel('Recusar').setStyle(ButtonStyle.Danger);
      const row = new ActionRowBuilder().addComponents(approveButton, refuseButton);
      await logChannel.send({ embeds: [embed], components: [row] });
      await message.reply('✅ Comprovante recebido! A administração irá analisá-lo em breve e você será notificado.');
      participantData.status = 'PENDING_APPROVAL';
    }
  } else {
    try {
        const logChannel = await client.channels.fetch(userRaffleData.logChannelId);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setAuthor({ name: `Mensagem de ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setDescription(message.content).setColor('#3498db')
            .setFooter({ text: `ID do Usuário: ${message.author.id}` }).setTimestamp();
          await logChannel.send({ embeds: [logEmbed] });
        }
    } catch (err) {
        console.error("Erro ao encaminhar DM para o canal de logs:", err);
    }
  }
});

client.login(process.env.TOKEN);