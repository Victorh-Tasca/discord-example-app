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
  PermissionsBitField,
} from 'discord.js';
import 'dotenv/config';
import { supabase } from './supabaseClient.js';

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
const creationSessions = new Map();

client.once(Events.ClientReady, () => {
  console.log(`Bot logado como ${client.user.tag}!`);
});


// --- Funções Auxiliares ---
function createRaffleDashboard(sessionData) {
    const embed = new EmbedBuilder()
      .setColor(sessionData.color || '#5865F2')
      .setTitle('Painel de Criação de Rifa')
      .setDescription('Use o menu abaixo para configurar cada detalhe da rifa. Esta mensagem será apagada ao publicar ou cancelar.')
      .addFields(
          { name: '📝 Título', value: sessionData.title || 'Não definido', inline: true },
          { name: '💰 Preço', value: sessionData.price ? `R$ ${sessionData.price.toFixed(2)}` : 'Não definido', inline: true },
          { name: '🎟️ Tickets Vendidos', value: `0/${String(sessionData.maxTickets || 'Não definido')}`, inline: true },
          { name: '▶️ Início', value: sessionData.startTime ? `<t:${Math.floor(sessionData.startTime.getTime() / 1000)}:f>` : 'Não definido', inline: true },
          { name: '⏹️ Fim', value: sessionData.endTime ? `<t:${Math.floor(sessionData.endTime.getTime() / 1000)}:f>` : 'Não definido', inline: true },
          { name: '🎨 Cor (Opcional)', value: sessionData.color || 'Padrão', inline: true },
          { name: '🔑 Chave PIX', value: sessionData.pixKey || 'Não definida', inline: true },
          { name: '✨ Tipo de PIX', value: sessionData.pixKeyType || 'Não definido', inline: true },
          { name: '📢 Anúncio', value: sessionData.publishChannelId ? `<#${sessionData.publishChannelId}>` : 'Não definido', inline: true },
          { name: '📢 Logs', value: sessionData.logChannelId ? `<#${sessionData.logChannelId}>` : 'Não definido', inline: true },
          { name: '📄 Descrição', value: sessionData.description || 'Não definida' },
          { name: '🖼️ Imagem (Opcional)', value: sessionData.image || 'Nenhuma' }
      );
  
    const isReadyToPublish = sessionData.title && sessionData.description && sessionData.price && sessionData.maxTickets && sessionData.startTime && sessionData.endTime && sessionData.pixKey && sessionData.pixKeyType && sessionData.publishChannelId && sessionData.logChannelId;
  
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('config_raffle_menu')
        .setPlaceholder('Escolha um item para configurar...')
        .addOptions(
            { label: 'Título', value: 'set_title' }, { label: 'Descrição', value: 'set_description' }, { label: 'Preço', value: 'set_price' },
            { label: 'Quantidade de Tickets', value: 'set_maxTickets' }, { label: 'Data de Início', value: 'set_startTime' }, { label: 'Data de Fim', value: 'set_endTime' },
            { label: 'Chave PIX', value: 'set_pixKey' }, { label: 'Tipo de PIX', value: 'set_pixKeyType' }, { label: 'Canal de Anúncio', value: 'set_publishChannel' },
            { label: 'Canal de Logs', value: 'set_logChannel' }, { label: 'Cor da Embed (Opcional)', value: 'set_color' }, { label: 'Imagem (Opcional)', value: 'set_image' }
        );
  
    const actions = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('publish_raffle').setLabel('Publicar Rifa').setStyle(ButtonStyle.Success).setDisabled(!isReadyToPublish),
        new ButtonBuilder().setCustomId('cancel_raffle').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
    );
    
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu), actions] };
}

async function drawWinner(raffleId, interaction = null) {
    const { data: raffleData, error: raffleError } = await supabase.from('raffles').select('*').eq('id', raffleId).single();
    if (raffleError || !raffleData) {
        if (interaction) await interaction.editReply({ content: '❌ Rifa não encontrada no banco de dados.' });
        return;
    }
    if (raffleData.is_drawn) {
        if (interaction) await interaction.editReply({ content: '⚠️ Esta rifa já foi sorteada.' });
        return;
    }

    const { data: participants, error: pError } = await supabase.from('participants').select('*').eq('raffle_id', raffleId).eq('status', 'CONFIRMED');
    const publishChannel = await client.channels.fetch(raffleData.publish_channel_id).catch(() => null);
    if (!publishChannel) {
        if (interaction) await interaction.editReply({ content: '❌ Não foi possível encontrar o canal de anúncio desta rifa.' });
        return;
    }

    try {
        const raffleMessage = await publishChannel.messages.fetch(raffleData.message_id);
        const disabledButton = new ButtonBuilder().setCustomId(`${raffleId}_participate`).setLabel('Rifa Encerrada').setStyle(ButtonStyle.Secondary).setDisabled(true);
        await raffleMessage.edit({ components: [new ActionRowBuilder().addComponents(disabledButton)] });
    } catch(err) { console.error("Não foi possível desabilitar o botão da rifa:", err); }

    await supabase.from('raffles').update({ is_drawn: true, end_time: new Date().toISOString() }).eq('id', raffleId);

    const winnerEmbed = new EmbedBuilder().setColor('#FFD700').setTitle(`🎉 Sorteio da Rifa "${raffleData.title}" Realizado! 🎉`);

    if (!participants || participants.length === 0) {
        winnerEmbed.setDescription('A rifa foi encerrada, mas não houve participantes com pagamento confirmado. Nenhum vencedor foi sorteado.');
        await publishChannel.send({ embeds: [winnerEmbed] });
        if (interaction) await interaction.editReply({ content: '✅ Rifa encerrada, mas não haviam participantes confirmados.' });
        return;
    }

    const ticketPool = [];
    participants.forEach(p => {
        for (let i = 0; i < p.quantity; i++) {
            ticketPool.push(p.user_id);
        }
    });

    const winnerId = ticketPool[Math.floor(Math.random() * ticketPool.length)];
    winnerEmbed.setDescription(`Parabéns ao grande vencedor: <@${winnerId}>! 🥳\n\nVocê ganhou: **${raffleData.title}**\n\nA administração entrará em contato.`);
    await publishChannel.send({ content: `Atenção, <@${winnerId}>!`, embeds: [winnerEmbed] });

    if (interaction) {
        // CORRIGIDO: Usa editReply em vez de reply
        await interaction.editReply({ content: `✅ Rifa encerrada e vencedor anunciado em ${publishChannel}!` });
    }
}


// --- Listener Principal de Interações ---
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'configurar_rifa') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) { return interaction.reply({ content: '❌ Você precisa ser um administrador.', ephemeral: true }); }
        const sessionId = interaction.user.id;
        const dashboard = createRaffleDashboard({});
        const panelMessage = await interaction.reply({ ...dashboard, fetchReply: true });
        creationSessions.set(sessionId, { panelMessageId: panelMessage.id });
    }
    
    if (interaction.commandName === 'encerrar_rifa') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) { return interaction.reply({ content: '❌ Você precisa ser um administrador.', ephemeral: true }); }
        
        // CORRIGIDO: Adia a resposta para ganhar mais tempo
        await interaction.deferReply({ ephemeral: true });
        
        const raffleId = interaction.options.getString('id_da_rifa');
        await drawWinner(raffleId, interaction);
    }

    if (interaction.commandName === 'rifa_rapida') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) { return interaction.reply({ content: '❌ Você precisa ser um administrador.', ephemeral: true }); }
        await interaction.deferReply({ ephemeral: true });
        const raffleId = `raffle_${Date.now()}`;
        const raffleData = {
            id: raffleId, creator_id: interaction.user.id, title: interaction.options.getString('titulo'), 
            description: `Rifa de teste para: ${interaction.options.getString('titulo')}.`, price: interaction.options.getNumber('preco'),
            max_tickets: interaction.options.getInteger('tickets'), start_time: new Date(), end_time: new Date(Date.now() + 24 * 60 * 60 * 1000),
            pix_key: '123456789', pix_key_type: 'Chave Aleatória', publish_channel_id: process.env.DEFAULT_PUBLISH_CHANNEL_ID,
            log_channel_id: process.env.DEFAULT_LOGS_CHANNEL_ID,
        };
        try {
          const publishChannel = await client.channels.fetch(raffleData.publish_channel_id);
          const embed = new EmbedBuilder().setColor('#00FF00').setTitle(`🎉 Rifa Rápida: ${raffleData.title} 🎉`).setDescription(raffleData.description)
            .addFields( { name: '🎟️ Tickets Vendidos', value: `0/${raffleData.max_tickets}` }, { name: '💰 Preço por Ticket', value: `R$ ${raffleData.price.toFixed(2)}`}, { name: '▶️ Início', value: `<t:${Math.floor(raffleData.start_time.getTime() / 1000)}:f>` }, { name: '⏹️ Encerramento', value: `<t:${Math.floor(raffleData.end_time.getTime() / 1000)}:f>` } )
            .setFooter({ text: `ID da Rifa: ${raffleId}` });
          const participateButton = new ButtonBuilder().setCustomId(`${raffleId}_participate`).setLabel('Quero Participar!').setStyle(ButtonStyle.Success);
          const raffleMessage = await publishChannel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(participateButton)] });
          const { error } = await supabase.from('raffles').insert({ ...raffleData, message_id: raffleMessage.id });
          if (error) throw error;
          await interaction.editReply({ content: `✅ Rifa de teste publicada com sucesso em ${publishChannel}!`});
        } catch (error) { await interaction.editReply({ content: `❌ Erro ao criar rifa de teste. Verifique os IDs de canal no .env.` }); }
    }
  }

  // O restante do código permanece o mesmo.
  if (interaction.isStringSelectMenu() && interaction.customId === 'config_raffle_menu') {
    const sessionId = interaction.user.id;
    const sessionData = creationSessions.get(sessionId);
    if (!sessionData) return interaction.update({ content: 'Esta sessão de criação expirou.', embeds: [], components: [] });
    
    const field = interaction.values[0].replace('set_', '');
    if (field === 'startTime' || field === 'endTime') {
        const modal = new ModalBuilder().setCustomId(`datetime_modal_${field}`).setTitle(`Definir Data de ${field === 'startTime' ? 'Início' : 'Fim'}`);
        const dayInput = new TextInputBuilder().setCustomId('day').setLabel("Dia (DD)").setStyle(TextInputStyle.Short).setPlaceholder('Ex: 01').setMinLength(2).setMaxLength(2).setRequired(true);
        const monthInput = new TextInputBuilder().setCustomId('month').setLabel("Mês (MM)").setStyle(TextInputStyle.Short).setPlaceholder('Ex: 09').setMinLength(2).setMaxLength(2).setRequired(true);
        const yearInput = new TextInputBuilder().setCustomId('year').setLabel("Ano (AAAA)").setStyle(TextInputStyle.Short).setPlaceholder('Ex: 2025').setMinLength(4).setMaxLength(4).setRequired(true);
        const hourInput = new TextInputBuilder().setCustomId('hour').setLabel("Hora (HH)").setStyle(TextInputStyle.Short).setPlaceholder('Ex: 19').setMinLength(2).setMaxLength(2).setRequired(true);
        const minuteInput = new TextInputBuilder().setCustomId('minute').setLabel("Minuto (MM)").setStyle(TextInputStyle.Short).setPlaceholder('Ex: 30').setMinLength(2).setMaxLength(2).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(dayInput), new ActionRowBuilder().addComponents(monthInput), new ActionRowBuilder().addComponents(yearInput), new ActionRowBuilder().addComponents(hourInput), new ActionRowBuilder().addComponents(minuteInput));
        await interaction.showModal(modal);
        return;
    }
    if (field === 'pixKeyType') {
        const selectMenu = new StringSelectMenuBuilder().setCustomId('select_pixtype').setPlaceholder('Selecione o tipo da Chave PIX').addOptions([ { label: 'CPF / CNPJ', value: 'CPF/CNPJ' }, { label: 'Celular', value: 'Celular' }, { label: 'E-mail', value: 'E-mail' }, { label: 'Chave Aleatória', value: 'Chave Aleatória' } ]);
        await interaction.reply({ content: 'Por favor, selecione o tipo da sua chave PIX:', components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
        return;
    }
    const prompts = { title: 'Qual será o título da rifa?', description: 'Qual a descrição?', price: 'Qual o preço por número? (Ex: 5.50)', image: 'Envie a URL da imagem.', color: 'Qual a cor da embed? (HEX, ex: #FF0000)', maxTickets: 'Qual a quantidade de tickets?', pixKey: 'Qual a Chave PIX?', publishChannel: 'Envie o ID do canal de anúncio.', logChannel: 'Envie o ID do canal de logs.', };
    await interaction.reply({ content: `**${prompts[field]}**`, ephemeral: true });
    const filter = (msg) => msg.author.id === interaction.user.id;
    try {
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 120000, errors: ['time'] });
        const message = collected.first(); const content = message.content;
        switch (field) {
            case 'price':
            case 'maxTickets':
                const numValue = parseFloat(content);
                if (isNaN(numValue) || numValue <= 0) { throw new Error('O valor deve ser um número positivo.'); }
                sessionData[field] = numValue;
                break;
            case 'color':
                if (!/^#[0-9A-F]{6}$/i.test(content)) { throw new Error('Código de cor inválido. Use o formato HEX (ex: #FF5733).'); }
                sessionData.color = content.toUpperCase();
                break;
            case 'logChannel':
            case 'publishChannel':
                const channel = await interaction.guild.channels.fetch(content).catch(()=>null);
                if (!channel || channel.type !== ChannelType.GuildText) { throw new Error("ID de canal de texto inválido."); }
                const botPermissions = channel.permissionsFor(client.user);
                if (!botPermissions.has(PermissionsBitField.Flags.ViewChannel) || !botPermissions.has(PermissionsBitField.Flags.SendMessages)) { throw new Error(`Eu não tenho permissão para ver ou enviar mensagens em <#${content}>.`); }
                sessionData[field === 'logChannel' ? 'logChannelId' : 'publishChannelId'] = content;
                break;
            default:
                sessionData[field] = content;
                break;
        }
        await message.delete();
        const dashboard = createRaffleDashboard(sessionData);
        const panelMessage = await interaction.channel.messages.fetch(sessionData.panelMessageId);
        await panelMessage.edit(dashboard);
        await interaction.deleteReply();
    } catch (error) { 
        await interaction.followUp({ content: `❌ Erro: ${error.message}. Operação cancelada.`, ephemeral: true }).catch(()=>{});
        await interaction.deleteReply().catch(()=>{}); 
    }
  }
  if (interaction.isButton() && (interaction.customId === 'publish_raffle' || interaction.customId === 'cancel_raffle')) {
    const sessionId = interaction.user.id;
    const sessionData = creationSessions.get(sessionId);
    if (!sessionData) return interaction.reply({ content: 'Sessão não encontrada.', ephemeral: true });
    const panelMessageToDel = await interaction.channel.messages.fetch(sessionData.panelMessageId).catch(() => null);
    if (panelMessageToDel) await panelMessageToDel.delete();
    if (interaction.customId === 'publish_raffle') {
        const raffleId = `raffle_${Date.now()}`;
        try {
          const publishChannel = await client.channels.fetch(sessionData.publishChannelId);
          const embed = new EmbedBuilder().setColor(sessionData.color || '#5865F2').setTitle(`🎉 Rifa: ${sessionData.title} 🎉`).setDescription(sessionData.description)
            .addFields( { name: '🎟️ Tickets Vendidos', value: `0/${sessionData.maxTickets}` }, { name: '💰 Preço por Ticket', value: `R$ ${sessionData.price.toFixed(2)}`}, { name: '▶️ Início', value: `<t:${Math.floor(sessionData.startTime.getTime() / 1000)}:f>` }, { name: '⏹️ Encerramento', value: `<t:${Math.floor(sessionData.endTime.getTime() / 1000)}:f>` })
            .setImage(sessionData.image || null).setFooter({ text: `ID da Rifa: ${raffleId}` });
          const participateButton = new ButtonBuilder().setCustomId(`${raffleId}_participate`).setLabel('Quero Participar!').setStyle(ButtonStyle.Success);
          const raffleMessage = await publishChannel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(participateButton)] });
          const { error } = await supabase.from('raffles').insert({
              id: raffleId, creator_id: interaction.user.id, message_id: raffleMessage.id, title: sessionData.title, description: sessionData.description,
              image_url: sessionData.image, color: sessionData.color, price: sessionData.price, max_tickets: sessionData.maxTickets,
              start_time: sessionData.startTime.toISOString(), end_time: sessionData.endTime.toISOString(),
              pix_key: sessionData.pixKey, pix_key_type: sessionData.pixKeyType,
              publish_channel_id: sessionData.publishChannelId, log_channel_id: sessionData.logChannelId,
          });
          if (error) throw error;
          await interaction.reply({ content: `✅ Rifa publicada com sucesso em ${publishChannel}!`, ephemeral: true });
        } catch (error) { await interaction.reply({ content: `❌ Erro ao publicar. Verifique os dados e as permissões.`, ephemeral: true }); }
    } else { await interaction.reply({ content: 'Criação de rifa cancelada.', ephemeral: true }); }
    creationSessions.delete(sessionId);
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith('datetime_modal_')) {
    const sessionId = interaction.user.id;
    const sessionData = creationSessions.get(sessionId);
    if (!sessionData) return;
    const targetField = interaction.customId.split('_')[2];
    try {
        const day = parseInt(interaction.fields.getTextInputValue('day')); const month = parseInt(interaction.fields.getTextInputValue('month')); const year = parseInt(interaction.fields.getTextInputValue('year')); const hour = parseInt(interaction.fields.getTextInputValue('hour')); const minute = parseInt(interaction.fields.getTextInputValue('minute'));
        if ([day, month, year, hour, minute].some(isNaN)) { throw new Error('Todos os campos devem ser números.'); }
        const finalDate = new Date(year, month - 1, day, hour, minute);
        if (isNaN(finalDate.getTime())) { throw new Error('A data inserida é inválida.'); }
        sessionData[targetField] = finalDate;
        const dashboard = createRaffleDashboard(sessionData);
        const panelMessage = await interaction.channel.messages.fetch(sessionData.panelMessageId);
        await panelMessage.edit(dashboard);
        await interaction.reply({ content: `✅ Data de ${targetField === 'startTime' ? 'início' : 'fim'} definida com sucesso!`, ephemeral: true });
    } catch (error) { await interaction.reply({ content: `❌ Erro ao processar a data: ${error.message}`, ephemeral: true }); }
  }
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'select_pixtype') {
        const sessionId = interaction.user.id;
        const sessionData = creationSessions.get(sessionId);
        if (!sessionData) return;
        sessionData.pixKeyType = interaction.values[0];
        const dashboard = createRaffleDashboard(sessionData);
        const panelMessage = await interaction.channel.messages.fetch(sessionData.panelMessageId);
        await panelMessage.edit(dashboard);
        await interaction.update({ content: '✅ Tipo de PIX definido!', components: [] });
        return;
    }
    if (interaction.customId.endsWith('_select_quantity')) {
        const raffleId = interaction.customId.replace('_select_quantity', '');
        const { data: raffleData, error } = await supabase.from('raffles').select('*').eq('id', raffleId).single();
        if (error || !raffleData) { return interaction.reply({ content: '❌ Desculpe, não encontrei esta rifa.', ephemeral: true }); }
        const quantity = parseInt(interaction.values[0]);
        if ((raffleData.sold_tickets + quantity) > raffleData.max_tickets) { return interaction.reply({ content: `Não há tickets suficientes. Restam ${raffleData.max_tickets - raffleData.sold_tickets}.` }); }
        const totalPrice = quantity * raffleData.price;
        const { error: insertError } = await supabase.from('participants').insert({ raffle_id: raffleId, user_id: interaction.user.id, quantity, total_price: totalPrice, status: 'PENDING_PAYMENT' });
        if (insertError) { return interaction.reply({ content: `❌ Ocorreu um erro ao registrar sua intenção. Tente novamente.` }); }
        const cancelButton = new ButtonBuilder().setCustomId(`cancel_purchase_${raffleId}`).setLabel('Cancelar Compra').setStyle(ButtonStyle.Danger);
        await interaction.reply({ content: `Ótimo! Você selecionou **${quantity} número(s)**.\nO valor total é **R$ ${totalPrice.toFixed(2)}**.\n\n` + `**Tipo de PIX:** ${raffleData.pix_key_type}\n` + `**Chave PIX para pagamento:** \`${raffleData.pix_key}\`\n\n` + `Após o pagamento, **envie o comprovante**. Se errar, pode cancelar a compra.`, components: [new ActionRowBuilder().addComponents(cancelButton)] });
    }
  }
  if (interaction.isButton() && interaction.customId.endsWith('_participate')) {
    const raffleId = interaction.customId.replace('_participate', '');
    const { data: raffleData, error } = await supabase.from('raffles').select('*').eq('id', raffleId).single();
    if (error || !raffleData) { return interaction.reply({ content: '❌ Esta rifa não está mais ativa ou foi removida.', ephemeral: true }); }
    const now = new Date();
    if (new Date(raffleData.start_time) > now && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) { return interaction.reply({ content: `Esta rifa ainda não começou. Inicia em <t:${Math.floor(new Date(raffleData.start_time).getTime() / 1000)}:R>.`, ephemeral: true }); }
    if (new Date(raffleData.end_time) < now) { return interaction.reply({ content: 'Esta rifa já foi encerrada.', ephemeral: true }); }
    if (raffleData.sold_tickets >= raffleData.max_tickets) { return interaction.reply({ content: 'Que pena! Os tickets para esta rifa já se esgotaram.', ephemeral: true }); }
    try {
      const remainingTickets = raffleData.max_tickets - raffleData.sold_tickets;
      const options = [ { label: '1 Número', value: '1' }, { label: '2 Números', value: '2' }, { label: '5 Números', value: '5' }, { label: '10 Números', value: '10' } ].filter(opt => parseInt(opt.value) <= remainingTickets);
      if (options.length === 0) { return interaction.reply({ content: 'Não há tickets suficientes para as opções padrão. Fale com um admin.', ephemeral: true }); }
      const selectMenu = new StringSelectMenuBuilder().setCustomId(`${raffleId}_select_quantity`).setPlaceholder('Selecione a quantidade de números').addOptions(options);
      await interaction.user.send({ content: `Olá! Você está participando da rifa **"${raffleData.title}"**. Restam **${remainingTickets}** tickets.\n\nSelecione quantos números você deseja:`, components: [new ActionRowBuilder().addComponents(selectMenu)] });
      await interaction.reply({ content: 'Enviei uma mensagem no seu privado para continuarmos!', ephemeral: true });
    } catch (error) { await interaction.reply({ content: 'Não consegui te enviar uma mensagem privada. Verifique suas configurações de privacidade.', ephemeral: true }); }
  }
  if (interaction.isButton() && interaction.customId.startsWith('cancel_purchase_')) {
    const raffleId = interaction.customId.replace('cancel_purchase_', '');
    const { error } = await supabase.from('participants').delete().eq('raffle_id', raffleId).eq('user_id', interaction.user.id).eq('status', 'PENDING_PAYMENT');
    if (error) { return interaction.update({ content: '❌ Ocorreu um erro ao cancelar sua compra.', components: [] }); }
    await interaction.update({ content: '✅ Sua intenção de compra foi cancelada com sucesso. Você pode participar novamente.', components: [] });
  }
  if (interaction.isButton() && (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('refuse_'))) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) { return interaction.reply({ content: '❌ Apenas administradores podem executar esta ação.', ephemeral: true }); }
    const parts = interaction.customId.split('_');
    const action = parts[0]; const userId = parts[parts.length - 1]; const raffleId = parts.slice(1, -1).join('_');
    const { data: participantResult, error: pError } = await supabase.from('participants').select('*, raffles(*)').eq('raffle_id', raffleId).eq('user_id', userId).or('status.eq.PENDING_APPROVAL,status.eq.PENDING_PAYMENT');
    if (pError || !participantResult || participantResult.length === 0) { return interaction.update({ content: '❌ Este participante não foi encontrado ou já foi processado.', components: [], embeds: [] }); }
    const participant = participantResult[0];
    const raffleData = participant.raffles;
    const user = await client.users.fetch(userId);
    const disabledRow = new ActionRowBuilder().addComponents( ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true), ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true) );
    if (action === 'approve') {
      if ((raffleData.sold_tickets + participant.quantity) > raffleData.max_tickets) {
          await interaction.update({ content: `❌ Não foi possível aprovar. A rifa ficaria com mais tickets que o limite. (Restantes: ${raffleData.max_tickets - raffleData.sold_tickets})`, components: [disabledRow]});
          await user.send(`❌ Seu pagamento para a rifa **"${raffleData.title}"** não pôde ser aprovado pois os tickets se esgotaram.`);
          return;
      }
      const newSoldTickets = raffleData.sold_tickets + participant.quantity;
      await supabase.from('raffles').update({ sold_tickets: newSoldTickets }).eq('id', raffleId);
      await supabase.from('participants').update({ status: 'CONFIRMED' }).eq('id', participant.id);
      try {
        const publishChannel = await client.channels.fetch(raffleData.publish_channel_id);
        const raffleMessage = await publishChannel.messages.fetch(raffleData.message_id);
        if (raffleMessage) {
            const updatedEmbed = EmbedBuilder.from(raffleMessage.embeds[0]);
            const fieldIndex = updatedEmbed.data.fields.findIndex(f => f.name.includes('Tickets'));
            if (fieldIndex !== -1) {
                updatedEmbed.data.fields[fieldIndex].name = '🎟️ Tickets Vendidos';
                updatedEmbed.data.fields[fieldIndex].value = `${newSoldTickets}/${raffleData.max_tickets}`;
            }
            await raffleMessage.edit({ embeds: [updatedEmbed] });
        }
      } catch (err) { console.error("Não foi possível editar a mensagem da rifa:", err); }
      await user.send(`✅ Pagamento Aprovado! Sua participação na rifa **"${raffleData.title}"** foi confirmada para **${participant.quantity} número(s)**.`);
      await interaction.update({ content: `✅ Pagamento de ${user.tag} aprovado por ${interaction.user.tag}.`, embeds: [interaction.message.embeds[0]], components: [disabledRow]});
    } else { // refuse
      await supabase.from('participants').update({ status: 'REFUSED' }).eq('id', participant.id);
      await user.send(`❌ Pagamento Recusado para a rifa **"${raffleData.title}"**.`);
      await interaction.update({ content: `❌ Pagamento de ${user.tag} recusado por ${interaction.user.tag}.`, embeds: [interaction.message.embeds[0]], components: [disabledRow]});
    }
  }
});
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || message.channel.type !== ChannelType.DM) return;
  const { data: participant, error } = await supabase.from('participants').select('*, raffles(*)').eq('user_id', message.author.id).eq('status', 'PENDING_PAYMENT').limit(1).single();
  if (error || !participant) return;
  const raffleData = participant.raffles;
  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();
    const logChannel = await client.channels.fetch(raffleData.log_channel_id);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle('Solicitação de Aprovação de Pagamento').setDescription(`O usuário **${message.author.tag}** (<@${message.author.id}>) enviou um comprovante para a rifa **"${raffleData.title}"**.`)
        .setColor('#f1c40f')
        .addFields( { name: 'Quantidade', value: `${participant.quantity}`, inline: true }, { name: 'Valor Total', value: `R$ ${participant.total_price.toFixed(2)}`, inline: true }, { name: 'ID da Rifa', value: `\`${raffleData.id}\``, inline: true } ).setImage(attachment.url).setTimestamp();
      const approveButton = new ButtonBuilder().setCustomId(`approve_${raffleData.id}_${message.author.id}`).setLabel('Aprovar').setStyle(ButtonStyle.Success);
      const refuseButton = new ButtonBuilder().setCustomId(`refuse_${raffleData.id}_${message.author.id}`).setLabel('Recusar').setStyle(ButtonStyle.Danger);
      const row = new ActionRowBuilder().addComponents(approveButton, refuseButton);
      await logChannel.send({ embeds: [embed], components: [row] });
      await supabase.from('participants').update({ status: 'PENDING_APPROVAL' }).eq('id', participant.id);
      await message.reply('✅ Comprovante recebido! A administração irá analisá-lo em breve e você será notificado.');
    }
  } else {
    try {
        const logChannel = await client.channels.fetch(raffleData.log_channel_id);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setAuthor({ name: `Mensagem de ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setDescription(message.content).setColor('#3498db')
            .setFooter({ text: `ID do Usuário: ${message.author.id}` }).setTimestamp();
          await logChannel.send({ embeds: [logEmbed] });
        }
    } catch (err) { console.error("Erro ao encaminhar DM para o canal de logs:", err); }
  }
});

setInterval(async () => {
    const { data: expiredRaffles, error } = await supabase.from('raffles').select('id').lt('end_time', new Date().toISOString()).eq('is_drawn', false);
    if (error) { console.error("Erro ao buscar rifas encerradas:", error); return; }
    if (expiredRaffles && expiredRaffles.length > 0) {
        console.log(`[AUTO] Encontradas ${expiredRaffles.length} rifas para sortear.`);
        for (const raffle of expiredRaffles) {
            await drawWinner(raffle.id);
        }
    }
}, 60 * 1000);

client.login(process.env.TOKEN);