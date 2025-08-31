// deploy-commands.js
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { SlashCommandBuilder } from 'discord.js';
import 'dotenv/config';

const commands = [
  new SlashCommandBuilder()
    .setName('configurar_rifa')
    .setDescription('Abre o formulário para criar e configurar uma nova rifa.')
    .setDMPermission(false), // Garante que o comando só pode ser usado em servidores
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

console.log('Registrando comandos...');

rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands })
  .then(() => console.log('Comandos registrados com sucesso!'))
  .catch(console.error);