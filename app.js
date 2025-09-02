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
  AttachmentBuilder,
} from 'discord.js';
import express from 'express';
import 'dotenv/config';
import { supabase } from './supabaseClient.js';

// --- Captura Global de Erros ---
process.on('unhandledRejection', error => {
	console.error('ERRO NÃO TRATADO (Promise Rejeitada):', error);
});
process.on('uncaughtException', error => {
	console.error('ERRO NÃO TRATADO (Exceção):', error);
});

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
  console.log(`[INICIALIZAÇÃO] Evento 'ClientReady' disparado. Bot está online!`);
  console.log(`Bot logado como ${client.user.tag}!`);
});

// --- Funções Auxiliares ---
async function updateRaffleMessage(raffleId) {
    const { data: raffleData } = await supabase.from('raffles').select('*').eq('id', raffleId).single();
    if (!raffleData) return;
    const { data: participants } = await supabase.from('participants').select('quantity, status').eq('raffle_id', raffleId);
    let soldTickets = 0;
    let reservedTickets = 0;
    if (participants) {
        participants.forEach(p => {
            if (p.status === 'CONFIRMED') soldTickets += p.quantity;
            if (['PENDING_PAYMENT', 'PENDING_APPROVAL'].includes(p.status)) reservedTickets += p.quantity;
        });
    }
    const remainingTickets = raffleData.max_tickets - soldTickets - reservedTickets;
    const reservedText = reservedTickets > 0 ? ` (${reservedTickets} em processo de compra)` : '';
    try {
        const publishChannel = await client.channels.fetch(raffleData.publish_channel_id);
        const raffleMessage = await publishChannel.messages.fetch(raffleData.message_id);
        const updatedEmbed = EmbedBuilder.from(raffleMessage.embeds[0]);
        const fieldIndex = updatedEmbed.data.fields.findIndex(f => f.name.includes('Tickets'));
        if (fieldIndex !== -1) {
            updatedEmbed.data.fields[fieldIndex].name = '🎟️ Tickets Restantes';
            updatedEmbed.data.fields[fieldIndex].value = `${remainingTickets}/${raffleData.max_tickets}${reservedText}`;
        }
        await raffleMessage.edit({ embeds: [updatedEmbed] });
    } catch (error) {
        console.error("Erro ao atualizar a mensagem da rifa:", error);
    }
}

function createRaffleDashboard(sessionData) {
    const embed = new EmbedBuilder().setColor(sessionData.color || '#5865F2').setTitle('Painel de Criação de Rifa')
      .setDescription('Use o menu abaixo para configurar cada detalhe da rifa. Esta mensagem será apagada ao publicar ou cancelar.')
      .addFields(
          { name: '📝 Título', value: sessionData.title || 'Não definido', inline: true },
          { name: '💰 Preço', value: sessionData.price ? `R$ ${sessionData.price.toFixed(2)}` : 'Não definido', inline: true },
          { name: '🎟️ Tickets Totais', value: String(sessionData.maxTickets || 'Não definido'), inline: true },
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
    const selectMenu = new StringSelectMenuBuilder().setCustomId('config_raffle_menu')
        .setPlaceholder('Escolha um item para configurar...')
        .addOptions(
            { label: 'Título', value: 'set_title' }, { label: 'Descrição', value: 'set_description' }, { label: 'Preço', value: 'set_price' },
            { label: 'Quantidade de Tickets', value: 'set_maxTickets' }, { label: 'Data de Início', value: 'set_startTime' }, { label: 'Data de Fim', value: 'set_endTime' },
            { label: 'Chave PIX', value: 'set_pixKey' }, { label: 'Tipo de PIX', value: 'set_pixKeyType' },
            { label: 'Cor da Embed (Opcional)', value: 'set_color' }, { label: 'Imagem (Opcional)', value: 'set_image' }
        );
    const actions = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('publish_raffle').setLabel('Publicar Rifa').setStyle(ButtonStyle.Success).setDisabled(!isReadyToPublish),
        new ButtonBuilder().setCustomId('cancel_raffle').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
    );
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu), actions] };
}

async function drawWinner(raffleId, interaction = null) {
    const { data: raffleData, error: raffleError } = await supabase.from('raffles').select('*').eq('id', raffleId).single();
    if (raffleError || !raffleData || raffleData.is_drawn) {
        if (interaction) await interaction.editReply({ content: '❌ Rifa não encontrada ou já sorteada.' }); return;
    }
    const { data: participants } = await supabase.from('participants').select('user_id, ticket_numbers').eq('raffle_id', raffleId).eq('status', 'CONFIRMED');
    const publishChannel = await client.channels.fetch(raffleData.publish_channel_id).catch(() => null);
    if (!publishChannel) {
        if (interaction) await interaction.editReply({ content: '❌ Não foi possível encontrar o canal de anúncio desta rifa.' }); return;
    }
    try {
        const raffleMessage = await publishChannel.messages.fetch(raffleData.message_id);
        const disabledButton = new ButtonBuilder().setCustomId(`${raffleId}_participate`).setLabel('Rifa Encerrada').setStyle(ButtonStyle.Secondary).setDisabled(true);
        await raffleMessage.edit({ components: [new ActionRowBuilder().addComponents(disabledButton)] });
    } catch(err) { console.error("Não foi possível desabilitar o botão da rifa:", err); }
    await supabase.from('raffles').update({ is_drawn: true, end_time: new Date().toISOString() }).eq('id', raffleId);
    const winnerEmbed = new EmbedBuilder().setColor('#FFD700').setTitle(`🎉 Sorteio da Rifa "${raffleData.title}" Realizado! 🎉`);
    if (!participants || participants.length === 0 || !participants.some(p => p.ticket_numbers && p.ticket_numbers.length > 0)) {
        winnerEmbed.setDescription('A rifa foi encerrada sem participantes confirmados. Nenhum vencedor foi sorteado.');
        await publishChannel.send({ embeds: [winnerEmbed] });
        if (interaction) await interaction.editReply({ content: '✅ Rifa encerrada, mas não haviam participantes confirmados.' });
        return;
    }
    const allTicketNumbers = participants.flatMap(p => p.ticket_numbers);
    const winningNumber = allTicketNumbers[Math.floor(Math.random() * allTicketNumbers.length)];
    const winner = participants.find(p => p.ticket_numbers.includes(winningNumber));
    winnerEmbed.setDescription(`O número da sorte foi **${winningNumber}**!\n\nParabéns ao grande vencedor: <@${winner.user_id}>! 🥳\n\nVocê ganhou: **${raffleData.title}**\n\nA administração entrará em contato.`);
    await publishChannel.send({ content: `Atenção, <@${winner.user_id}>!`, embeds: [winnerEmbed] });
    if (interaction) await interaction.editReply({ content: `✅ Rifa encerrada e vencedor anunciado em ${publishChannel}!` });
}

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
        if (!interaction.inGuild()) return;
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ Você precisa ser um administrador para usar este comando.', ephemeral: true });
        }
        switch (interaction.commandName) {
            case 'ajuda':
                const helpEmbed = new EmbedBuilder().setColor('#0099ff').setTitle('Painel de Ajuda | Comandos de Administrador').setDescription('Aqui estão todos os comandos disponíveis para gerenciar as rifas.')
                    .addFields(
                        { name: '`/configurar_rifa`', value: 'Abre um painel interativo para criar uma nova rifa detalhada.' },
                        { name: '`/configurar_canal_anuncios`', value: 'Define o canal padrão para anúncios de rifas neste servidor.'},
                        { name: '`/configurar_canal_logs`', value: 'Define o canal padrão para logs de pagamento neste servidor.'},
                        { name: '`/listar_rifas`', value: 'Lista todas as rifas que estão ativas no momento.' },
                        { name: '`/listar_participantes`', value: 'Gera um arquivo `.txt` com os participantes e números de uma rifa.' },
                        { name: '`/encerrar_rifa`', value: 'Encerra uma rifa e sorteia um vencedor. Requer o `id_da_rifa`.' },
                        { name: '`/cancelar_rifa`', value: 'Cancela uma rifa sem um vencedor. Requer o `id_da_rifa`.' },
                        { name: '`/rifa_rapida`', value: 'Cria uma rifa de teste com valores padrão.' },
                        { name: '`/ajuda`', value: 'Exibe esta mensagem de ajuda.' }
                    );
                await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
                break;
            case 'configurar_rifa':
                const { data: settings } = await supabase.from('guild_settings').select('*').eq('guild_id', interaction.guild.id).single();
                if (!settings || !settings.default_publish_channel_id || !settings.default_logs_channel_id) {
                    return interaction.reply({ content: `❌ Os canais padrão para este servidor ainda não foram definidos. Use os comandos \`/configurar_canal_anuncios\` e \`/configurar_canal_logs\` primeiro.`, ephemeral: true });
                }
                if (creationSessions.has(interaction.user.id)) {
                    return interaction.reply({ content: '⚠️ Você já tem um painel de criação ativo.', ephemeral: true });
                }
                const sessionId = interaction.user.id;
                const sessionData = { 
                    panelMessageId: null,
                    publishChannelId: settings.default_publish_channel_id,
                    logChannelId: settings.default_logs_channel_id
                };
                const dashboard = createRaffleDashboard(sessionData);
                const panelMessage = await interaction.reply({ ...dashboard, fetchReply: true });
                sessionData.panelMessageId = panelMessage.id;
                creationSessions.set(sessionId, sessionData);
                break;
            case 'encerrar_rifa':
                await interaction.deferReply({ ephemeral: true });
                await drawWinner(interaction.options.getString('id_da_rifa'), interaction);
                break;
            case 'cancelar_rifa':
                await interaction.deferReply({ ephemeral: true });
                const raffleIdToCancel = interaction.options.getString('id_da_rifa');
                const { data: raffleToCancel, error: cancelError } = await supabase.from('raffles').select('*').eq('id', raffleIdToCancel).single();
                if (cancelError || !raffleToCancel) { return interaction.editReply({ content: '❌ Rifa não encontrada com este ID.' }); }
                if (raffleToCancel.is_drawn) { return interaction.editReply({ content: '⚠️ Esta rifa já foi encerrada ou cancelada.' }); }
                await supabase.from('raffles').update({ is_drawn: true, end_time: new Date().toISOString() }).eq('id', raffleIdToCancel);
                try {
                    const publishChannel = await client.channels.fetch(raffleToCancel.publish_channel_id);
                    const raffleMessage = await publishChannel.messages.fetch(raffleToCancel.message_id);
                    const cancelledEmbed = EmbedBuilder.from(raffleMessage.embeds[0]).setTitle(`❌ RIFA CANCELADA: ${raffleToCancel.title}`).setColor('#FF0000').setDescription('Esta rifa foi cancelada pela administração.');
                    const disabledButton = new ButtonBuilder().setCustomId(`${raffleIdToCancel}_participate`).setLabel('Rifa Cancelada').setStyle(ButtonStyle.Danger).setDisabled(true);
                    await raffleMessage.edit({ embeds: [cancelledEmbed], components: [new ActionRowBuilder().addComponents(disabledButton)] });
                    await interaction.editReply({ content: `✅ A rifa **"${raffleToCancel.title}"** foi cancelada com sucesso!` });
                } catch(err) { await interaction.editReply({ content: '⚠️ A rifa foi cancelada no sistema, mas não foi possível editar a mensagem de anúncio.' }); }
                break;
            case 'listar_rifas':
                await interaction.deferReply({ ephemeral: true });
                const { data: activeRaffles } = await supabase.from('raffles').select('id, title, end_time').eq('is_drawn', false).eq('guild_id', interaction.guild.id);
                if (!activeRaffles || activeRaffles.length === 0) { return interaction.editReply({ content: 'Não há nenhuma rifa ativa neste servidor.' }); }
                const listEmbed = new EmbedBuilder().setColor('#0099ff').setTitle('Rifas Ativas neste Servidor')
                    .setDescription(activeRaffles.map(r => `**${r.title}**\n*ID:* \`${r.id}\`\n*Encerra em:* <t:${Math.floor(new Date(r.end_time).getTime() / 1000)}:R>`).join('\n\n'));
                await interaction.editReply({ embeds: [listEmbed] });
                break;
            case 'listar_participantes':
                await interaction.deferReply({ ephemeral: true });
                const raffleIdToList = interaction.options.getString('id_da_rifa');
                const { data: raffleToList } = await supabase.from('raffles').select('title').eq('id', raffleIdToList).single();
                if (!raffleToList) { return interaction.editReply({ content: `❌ Rifa com ID \`${raffleIdToList}\` não encontrada.`}); }
                const { data: participantsToList } = await supabase.from('participants').select('user_id, quantity, ticket_numbers').eq('raffle_id', raffleIdToList).eq('status', 'CONFIRMED');
                if (!participantsToList || participantsToList.length === 0) { return interaction.editReply({ content: `A rifa **"${raffleToList.title}"** ainda não tem participantes confirmados.`}); }
                let fileContent = `Lista de Participantes para a Rifa: ${raffleToList.title}\nID: ${raffleIdToList}\n\n`;
                for (const p of participantsToList) {
                    const user = await client.users.fetch(p.user_id).catch(() => ({ tag: `ID: ${p.user_id}` }));
                    const numbers = p.ticket_numbers ? p.ticket_numbers.join(', ') : 'N/A';
                    fileContent += `${user.tag} (${p.quantity} tickets) - Números: [${numbers}]\n`;
                }
                const attachment = new AttachmentBuilder(Buffer.from(fileContent, 'utf-8'), { name: `participantes_${raffleIdToList}.txt` });
                await interaction.editReply({ content: `Aqui está a lista de participantes para a rifa **"${raffleToList.title}"**:`, files: [attachment] });
                break;
            case 'configurar_canal_anuncios':
                const pubChannel = interaction.options.getChannel('canal');
                await supabase.from('guild_settings').upsert({ guild_id: interaction.guild.id, default_publish_channel_id: pubChannel.id });
                await interaction.reply({ content: `✅ O canal de anúncios foi definido como ${pubChannel}.`, ephemeral: true });
                break;
            case 'configurar_canal_logs':
                const logsChannel = interaction.options.getChannel('canal');
                await supabase.from('guild_settings').upsert({ guild_id: interaction.guild.id, default_logs_channel_id: logsChannel.id });
                await interaction.reply({ content: `✅ O canal de logs foi definido como ${logsChannel}.`, ephemeral: true });
                break;
            case 'rifa_rapida':
                await interaction.deferReply({ ephemeral: true });
                const { data: guildSettings } = await supabase.from('guild_settings').select('*').eq('guild_id', interaction.guild.id).single();
                if (!guildSettings || !guildSettings.default_publish_channel_id || !guildSettings.default_logs_channel_id) {
                    return interaction.editReply({ content: `❌ Os canais padrão não foram definidos. Use \`/configurar_canal_anuncios\` e \`/configurar_canal_logs\`.` });
                }
                const quickRaffleId = `raffle_${Date.now()}`;
                const quickRaffleData = {
                    id: quickRaffleId, creator_id: interaction.user.id, title: interaction.options.getString('titulo'), 
                    description: `Rifa de teste para: ${interaction.options.getString('titulo')}.`, price: interaction.options.getNumber('preco'),
                    max_tickets: interaction.options.getInteger('tickets'), start_time: new Date(), end_time: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    pix_key: '123456789', pix_key_type: 'Chave Aleatória', 
                    publish_channel_id: guildSettings.default_publish_channel_id, log_channel_id: guildSettings.default_logs_channel_id,
                };
                try {
                  const publishChannel = await client.channels.fetch(quickRaffleData.publish_channel_id);
                  const embed = new EmbedBuilder().setColor('#00FF00').setTitle(`🎉 Rifa Rápida: ${quickRaffleData.title} 🎉`).setDescription(quickRaffleData.description)
                    .addFields( { name: '🎟️ Tickets Restantes', value: `${quickRaffleData.max_tickets}/${quickRaffleData.max_tickets}` }, { name: '💰 Preço por Ticket', value: `R$ ${quickRaffleData.price.toFixed(2)}`}, { name: '▶️ Início', value: `<t:${Math.floor(quickRaffleData.start_time.getTime() / 1000)}:f>` }, { name: '⏹️ Encerramento', value: `<t:${Math.floor(quickRaffleData.end_time.getTime() / 1000)}:f>` } )
                    .setFooter({ text: `ID da Rifa: ${quickRaffleId}` });
                  const participateButton = new ButtonBuilder().setCustomId(`${quickRaffleId}_participate`).setLabel('Quero Participar!').setStyle(ButtonStyle.Success);
                  const raffleMessage = await publishChannel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(participateButton)] });
                  await supabase.from('raffles').insert({ ...quickRaffleData, guild_id: interaction.guild.id, message_id: raffleMessage.id });
                  await interaction.editReply({ content: `✅ Rifa de teste publicada com sucesso em ${publishChannel}!`});
                } catch (error) { await interaction.editReply({ content: `❌ Erro ao criar rifa de teste. Verifique as permissões nos canais configurados.` }); }
                break;
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (!interaction.inGuild() && interaction.customId !== 'select_pixtype') return;
        if (interaction.customId === 'config_raffle_menu') {
            const sessionId = interaction.user.id;
            const sessionData = creationSessions.get(sessionId);
            if (!sessionData) return;
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
            const prompts = { title: 'Qual será o título da rifa?', description: 'Qual a descrição?', price: 'Qual o preço? (Ex: 5.50)', image: 'Envie a URL da imagem.', color: 'Qual a cor da embed? (HEX, ex: #FF0000)', maxTickets: 'Qual a quantidade de tickets?', pixKey: 'Qual a Chave PIX?', };
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
                        if (!/^#[0-9A-F]{6}$/i.test(content)) { throw new Error('Código de cor inválido. Use o formato HEX.'); }
                        sessionData.color = content.toUpperCase();
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
        } else if (interaction.customId === 'select_pixtype') {
            if (!interaction.inGuild()) return;
            const sessionId = interaction.user.id;
            const sessionData = creationSessions.get(sessionId);
            if (!sessionData) return;
            sessionData.pixKeyType = interaction.values[0];
            const dashboard = createRaffleDashboard(sessionData);
            const panelMessage = await interaction.channel.messages.fetch(sessionData.panelMessageId);
            await panelMessage.edit(dashboard);
            await interaction.update({ content: '✅ Tipo de PIX definido!', components: [] });
        }
    }
  
    if (interaction.isButton()) {
        if (!interaction.inGuild() && !interaction.customId.startsWith('select_quantity_button_') && !interaction.customId.startsWith('cancel_purchase_')) return;

        if (interaction.customId === 'publish_raffle' || interaction.customId === 'cancel_raffle') {
            const sessionId = interaction.user.id;
            const sessionData = creationSessions.get(sessionId);
            if (!sessionData) return;
            const panelMessageToDel = await interaction.channel.messages.fetch(sessionData.panelMessageId).catch(() => null);
            if (panelMessageToDel) await panelMessageToDel.delete();
            if (interaction.customId === 'publish_raffle') {
                const raffleId = `raffle_${Date.now()}`;
                try {
                  const publishChannel = await client.channels.fetch(sessionData.publishChannelId);
                  const embed = new EmbedBuilder().setColor(sessionData.color || '#5865F2').setTitle(`🎉 Rifa: ${sessionData.title} 🎉`).setDescription(sessionData.description)
                    .addFields( { name: '🎟️ Tickets Restantes', value: `${sessionData.maxTickets}/${sessionData.maxTickets}` }, { name: '💰 Preço por Ticket', value: `R$ ${sessionData.price.toFixed(2)}`}, { name: '▶️ Início', value: `<t:${Math.floor(sessionData.startTime.getTime() / 1000)}:f>` }, { name: '⏹️ Encerramento', value: `<t:${Math.floor(sessionData.endTime.getTime() / 1000)}:f>` })
                    .setImage(sessionData.image || null).setFooter({ text: `ID da Rifa: ${raffleId}` });
                  const participateButton = new ButtonBuilder().setCustomId(`${raffleId}_participate`).setLabel('Quero Participar!').setStyle(ButtonStyle.Success);
                  const raffleMessage = await publishChannel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(participateButton)] });
                  await supabase.from('raffles').insert({
                      id: raffleId, creator_id: interaction.user.id, guild_id: interaction.guild.id, message_id: raffleMessage.id, title: sessionData.title, description: sessionData.description,
                      image_url: sessionData.image, color: sessionData.color, price: sessionData.price, max_tickets: sessionData.maxTickets,
                      start_time: sessionData.startTime.toISOString(), end_time: sessionData.endTime.toISOString(),
                      pix_key: sessionData.pixKey, pix_key_type: sessionData.pixKeyType,
                      publish_channel_id: sessionData.publishChannelId, log_channel_id: sessionData.logChannelId,
                  });
                  await interaction.reply({ content: `✅ Rifa publicada com sucesso!`, ephemeral: true });
                } catch (error) { await interaction.reply({ content: `❌ Erro ao publicar.`, ephemeral: true }); }
            } else { await interaction.reply({ content: 'Criação de rifa cancelada.', ephemeral: true }); }
            creationSessions.delete(sessionId);
        }

        if (interaction.customId.endsWith('_participate')) {
            const raffleId = interaction.customId.replace('_participate', '');
            const { data: raffleData, error } = await supabase.from('raffles').select('*').eq('id', raffleId).single();
            if (error || !raffleData) { return interaction.reply({ content: '❌ Esta rifa não está mais ativa.', ephemeral: true }); }
            const now = new Date();
            if (new Date(raffleData.start_time) > now && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) { return interaction.reply({ content: `Esta rifa ainda não começou.`, ephemeral: true }); }
            if (new Date(raffleData.end_time) < now) { return interaction.reply({ content: 'Esta rifa já foi encerrada.', ephemeral: true }); }
            const { data: participants } = await supabase.from('participants').select('quantity').in('status', ['CONFIRMED', 'PENDING_APPROVAL', 'PENDING_PAYMENT']).eq('raffle_id', raffleId);
            const reservedAndSoldTickets = participants ? participants.reduce((acc, p) => acc + p.quantity, 0) : 0;
            const remainingTickets = raffleData.max_tickets - reservedAndSoldTickets;
            if (remainingTickets <= 0) { return interaction.reply({ content: 'Que pena! Os tickets para esta rifa já se esgotaram.', ephemeral: true }); }
            try {
              const quantityButton = new ButtonBuilder().setCustomId(`select_quantity_button_${raffleId}`).setLabel('Escolher Quantidade de Tickets').setStyle(ButtonStyle.Primary);
              await interaction.user.send({ content: `Olá! Você está participando da rifa **"${raffleData.title}"**. Restam **${remainingTickets}** tickets.\n\nClique no botão para escolher.`, components: [new ActionRowBuilder().addComponents(quantityButton)] });
              await interaction.reply({ content: 'Enviei uma mensagem no seu privado para continuarmos!', ephemeral: true });
            } catch (error) { await interaction.reply({ content: 'Não consegui te enviar uma mensagem privada.', ephemeral: true }); }
        }
      
        if (interaction.customId.startsWith('select_quantity_button_')) {
            const raffleId = interaction.customId.replace('select_quantity_button_', '');
            const modal = new ModalBuilder().setCustomId(`select_quantity_modal_${raffleId}`).setTitle('Quantidade de Tickets');
            const quantityInput = new TextInputBuilder().setCustomId('quantity_input').setLabel('Quantos tickets você deseja comprar?').setStyle(TextInputStyle.Short).setPlaceholder('Ex: 1, 5, 20').setRequired(true);
            await interaction.showModal(modal.addComponents(new ActionRowBuilder().addComponents(quantityInput)));
        }

        if (interaction.customId.startsWith('cancel_purchase_')) {
            const raffleId = interaction.customId.replace('cancel_purchase_', '');
            await supabase.from('participants').update({ status: 'CANCELLED' }).eq('raffle_id', raffleId).eq('user_id', interaction.user.id).eq('status', 'PENDING_PAYMENT');
            await updateRaffleMessage(raffleId);
            await interaction.update({ content: '✅ Sua intenção de compra foi cancelada. Os tickets foram liberados.', components: [] });
        }

        if (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('refuse_')) {
            if (!interaction.inGuild()) return;
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) { return interaction.reply({ content: '❌ Apenas administradores podem fazer isso.', ephemeral: true }); }
            const parts = interaction.customId.split('_');
            const action = parts[0]; const userId = parts[parts.length - 1]; const raffleId = parts.slice(1, -1).join('_');
            const { data: participantResult } = await supabase.from('participants').select('*, raffles(*)').eq('raffle_id', raffleId).eq('user_id', userId).or('status.eq.PENDING_APPROVAL,status.eq.PENDING_PAYMENT');
            if (!participantResult || participantResult.length === 0) { return interaction.update({ content: '❌ Este participante não foi encontrado ou já foi processado.', components: [], embeds: [] }); }
            const participant = participantResult[0];
            const raffleData = participant.raffles;
            const user = await client.users.fetch(userId);
            const disabledRow = new ActionRowBuilder().addComponents( ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true), ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true) );
            if (action === 'approve') {
                const { data: existingNumbers } = await supabase.from('participants').select('ticket_numbers').eq('raffle_id', raffleId).eq('status', 'CONFIRMED').not('ticket_numbers', 'is', null);
                const highestNumber = existingNumbers ? existingNumbers.flatMap(p => p.ticket_numbers || []).reduce((max, num) => Math.max(max, num), 0) : 0;
                const newNumbers = Array.from({ length: participant.quantity }, (_, i) => highestNumber + i + 1);
                await supabase.from('participants').update({ status: 'CONFIRMED', ticket_numbers: newNumbers }).eq('id', participant.id);
                await user.send(`✅ Pagamento Aprovado! Sua participação na rifa **"${raffleData.title}"** foi confirmada.\n**Seus números são: \`${newNumbers.join(', ')}\`**.`);
                await interaction.update({ content: `✅ Pagamento de ${user.tag} aprovado por ${interaction.user.tag}.`, embeds: [interaction.message.embeds[0]], components: [disabledRow]});
            } else {
              await supabase.from('participants').update({ status: 'REFUSED' }).eq('id', participant.id);
              await user.send(`❌ Pagamento Recusado para a rifa **"${raffleData.title}"**.`);
              await interaction.update({ content: `❌ Pagamento de ${user.tag} recusado por ${interaction.user.tag}.`, embeds: [interaction.message.embeds[0]], components: [disabledRow]});
            }
            await updateRaffleMessage(raffleId);
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('datetime_modal_')) {
            if (!interaction.inGuild()) return;
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
                await interaction.reply({ content: `✅ Data definida!`, ephemeral: true });
            } catch (error) { await interaction.reply({ content: `❌ Erro: ${error.message}`, ephemeral: true }); }
        }

        if (interaction.customId.startsWith('select_quantity_modal_')) {
            const raffleId = interaction.customId.replace('select_quantity_modal_', '');
            await interaction.deferReply({ ephemeral: true });
            const { data: raffleData, error } = await supabase.from('raffles').select('*').eq('id', raffleId).single();
            if (error || !raffleData) { return interaction.editReply({ content: '❌ Desculpe, não encontrei esta rifa.' }); }
            const quantity = parseInt(interaction.fields.getTextInputValue('quantity_input'));
            if (isNaN(quantity) || quantity <= 0) { return interaction.editReply({ content: '❌ Por favor, insira um número válido e positivo.' }); }
            const { data: participants } = await supabase.from('participants').select('quantity').in('status', ['CONFIRMED', 'PENDING_APPROVAL', 'PENDING_PAYMENT']).eq('raffle_id', raffleId);
            const reservedAndSoldTickets = participants ? participants.reduce((acc, p) => acc + p.quantity, 0) : 0;
            const remainingTickets = raffleData.max_tickets - reservedAndSoldTickets;
            if (quantity > remainingTickets) { return interaction.editReply({ content: `❌ Não há tickets suficientes. Restam apenas **${remainingTickets}**.` }); }
            const totalPrice = quantity * raffleData.price;
            const { error: insertError } = await supabase.from('participants').insert({ raffle_id: raffleId, user_id: interaction.user.id, quantity, total_price: totalPrice, status: 'PENDING_PAYMENT', guild_id: raffleData.guild_id });
            if (insertError) { return interaction.editReply({ content: `❌ Ocorreu um erro ao registrar sua intenção.` }); }
            await updateRaffleMessage(raffleId);
            const cancelButton = new ButtonBuilder().setCustomId(`cancel_purchase_${raffleId}`).setLabel('Cancelar Compra').setStyle(ButtonStyle.Danger);
            await interaction.editReply({ content: `Ótimo! Sua solicitação para **${quantity} número(s)** foi registrada.\nO valor total é **R$ ${totalPrice.toFixed(2)}**.\n\n` + `**Tipo de PIX:** ${raffleData.pix_key_type}\n` + `**Chave PIX para pagamento:** \`${raffleData.pix_key}\`\n\n` + `Após o pagamento, **envie o comprovante (imagem) aqui nesta conversa**.`, components: [new ActionRowBuilder().addComponents(cancelButton)]});
        }
    }
  } catch (error) {
    console.error("ERRO CRÍTICO NA INTERAÇÃO:", error);
    if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ Ocorreu um erro ao processar sua solicitação.', ephemeral: true }).catch(err => console.error("Falha ao enviar followUp de erro:", err));
    } else {
        await interaction.reply({ content: '❌ Ocorreu um erro ao processar sua solicitação.', ephemeral: true }).catch(err => console.error("Falha ao enviar reply de erro:", err));
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
    } catch (err) { console.error("Erro ao encaminhar DM:", err); }
  }
});

setInterval(async () => {
    try {
        const { data: expiredRaffles, error } = await supabase.from('raffles').select('id').lt('end_time', new Date().toISOString()).eq('is_drawn', false);
        if (error) { console.error("[AUTO] Erro ao buscar rifas encerradas:", error); return; }
        if (expiredRaffles && expiredRaffles.length > 0) {
            console.log(`[AUTO] Encontradas ${expiredRaffles.length} rifas para sortear.`);
            for (const raffle of expiredRaffles) {
                try {
                    await drawWinner(raffle.id);
                } catch (drawError) {
                    console.error(`[AUTO] Falha ao sortear a rifa ${raffle.id}:`, drawError);
                }
            }
        }
    } catch (err) {
        console.error("[AUTO] Erro crítico dentro do setInterval:", err);
    }
}, 60 * 1000);

// --- Servidor Web para Hospedagem 24/7 ---
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('Bot de Rifas está vivo e operando!'); });
app.listen(port, '0.0.0.0', () => { 
    console.log(`[INICIALIZAÇÃO] Servidor web escutando na porta ${port}.`);
});

// --- Bloco Final de Login ---
const token = process.env.TOKEN;
if (!token) {
    console.error("[INICIALIZAÇÃO] ERRO CRÍTICO: TOKEN não foi encontrado.");
} else {
    console.log("[INICIALIZAÇÃO] Token carregado. Tentando conectar ao Discord...");
    client.login(token).catch(err => {
        console.error("[INICIALIZAÇÃO] ERRO CRÍTICO AO FAZER LOGIN:", err);
    });
}
