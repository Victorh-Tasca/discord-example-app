// delete-commands.js
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import 'dotenv/config';

// Carrega as variáveis de ambiente do seu arquivo .env
const { TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Por favor, defina TOKEN, CLIENT_ID, e GUILD_ID no seu arquivo .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

console.log('Iniciando a exclusão de todos os comandos de guilda (servidor)...');

// Envia uma lista vazia para o endpoint de comandos da guilda.
// Isso apaga todos os comandos APENAS neste servidor.
rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] })
	.then(() => console.log('✅ Todos os comandos de guilda foram excluídos com sucesso.'))
	.catch((error) => {
    console.error('Ocorreu um erro ao tentar excluir os comandos de guilda:');
    console.error(error);
  });

/*
// --- PARA APAGAR COMANDOS GLOBAIS (NÃO RECOMENDADO PARA TESTES) ---
// Comandos globais podem levar até 1 hora para serem atualizados.
// Descomente o código abaixo APENAS se você registrou comandos globalmente.

console.log('Iniciando a exclusão de todos os comandos globais...');

rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] })
	.then(() => console.log('✅ Todos os comandos globais foram excluídos com sucesso.'))
	.catch((error) => {
    console.error('Ocorreu um erro ao tentar excluir os comandos globais:');
    console.error(error);
  });
*/