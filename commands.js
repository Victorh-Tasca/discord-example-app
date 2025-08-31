import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { SlashCommandBuilder, ChannelType } from 'discord.js';
import 'dotenv/config';

const commands = [
  new SlashCommandBuilder().setName('configurar_rifa').setDescription('Abre o painel para criar e configurar uma nova rifa.'),
  new SlashCommandBuilder().setName('encerrar_rifa').setDescription('Encerra e sorteia o vencedor de uma rifa ativa.').addStringOption(option => option.setName('id_da_rifa').setDescription('O ID da rifa que você deseja encerrar e sortear.').setRequired(true)),
  new SlashCommandBuilder().setName('cancelar_rifa').setDescription('Cancela uma rifa ativa sem sortear um vencedor.').addStringOption(option => option.setName('id_da_rifa').setDescription('O ID da rifa que você deseja cancelar.').setRequired(true)),
  new SlashCommandBuilder().setName('listar_rifas').setDescription('Lista todas as rifas que estão ativas no momento.'),
  new SlashCommandBuilder().setName('listar_participantes').setDescription('Envia um arquivo com todos os participantes de uma rifa.').addStringOption(option => option.setName('id_da_rifa').setDescription('O ID da rifa da qual você quer a lista.').setRequired(true)),
  new SlashCommandBuilder().setName('rifa_rapida').setDescription('Cria uma rifa de teste com valores padrão preenchidos.').addStringOption(option => option.setName('titulo').setDescription('O título da rifa.').setRequired(true)).addNumberOption(option => option.setName('preco').setDescription('O preço de cada ticket.').setRequired(true)).addIntegerOption(option => option.setName('tickets').setDescription('A quantidade de tickets.').setRequired(true)),
  new SlashCommandBuilder().setName('ajuda').setDescription('Exibe todos os comandos de administrador disponíveis para o bot.'),
  
  // NOVOS COMANDOS DE CONFIGURAÇÃO
  new SlashCommandBuilder().setName('configurar_canal_anuncios').setDescription('Define o canal padrão para anúncios de rifas rápidas neste servidor.').addChannelOption(option => option.setName('canal').setDescription('O canal de texto para os anúncios.').addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName('configurar_canal_logs').setDescription('Define o canal padrão para logs de pagamento neste servidor.').addChannelOption(option => option.setName('canal').setDescription('O canal de texto para os logs.').addChannelTypes(ChannelType.GuildText).setRequired(true)),

].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

console.log('Registrando comandos globais...');

// Rota para comandos GLOBAIS
rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands })
  .then(() => console.log('Comandos globais registrados com sucesso! Lembre-se que pode levar até 1 hora para aparecerem.'))
  .catch(console.error);