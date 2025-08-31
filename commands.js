import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { SlashCommandBuilder } from 'discord.js';
import 'dotenv/config';

const commands = [
  new SlashCommandBuilder()
    .setName('configurar_rifa')
    .setDescription('Abre o painel para criar e configurar uma nova rifa.'),
    
  new SlashCommandBuilder()
    .setName('encerrar_rifa')
    .setDescription('Encerra uma rifa manualmente antes do tempo previsto.')
    .addStringOption(option => 
      option.setName('id_da_rifa')
        .setDescription('O ID da rifa que você deseja encerrar.')
        .setRequired(true)),

  // NOVO COMANDO RÁPIDO PARA TESTES
  new SlashCommandBuilder()
    .setName('rifa_rapida')
    .setDescription('Cria uma rifa de teste com valores padrão preenchidos.')
    .addStringOption(option =>
      option.setName('titulo')
        .setDescription('O título da rifa de teste.')
        .setRequired(true))
    .addNumberOption(option =>
      option.setName('preco')
        .setDescription('O preço de cada ticket.')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('tickets')
        .setDescription('A quantidade de tickets disponíveis.')
        .setRequired(true)),

].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

console.log('Registrando comandos...');

rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands })
  .then(() => console.log('Comandos registrados com sucesso!'))
  .catch(console.error);