// delete-commands.js
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import 'dotenv/config';

// Carrega as variáveis de ambiente do seu arquivo .env
const { TOKEN, CLIENT_ID } = process.env;

if (!TOKEN || !CLIENT_ID) {
  console.error('Por favor, defina TOKEN e CLIENT_ID no seu arquivo .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

console.log('Iniciando a exclusão de todos os comandos globais...');

// Envia uma lista vazia para o endpoint de comandos GLOBAIS.
// Isso apaga todos os comandos em todos os servidores onde o bot está.
rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] })
	.then(() => console.log('✅ Todos os comandos globais foram excluídos com sucesso.'))
	.catch((error) => {
    console.error('Ocorreu um erro ao tentar excluir os comandos globais:');
    console.error(error);
  });



const { GUILD_ID } = process.env;
if (GUILD_ID) {
    console.log('Iniciando a exclusão de todos os comandos de servidor (guild)...');
    rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] })
        .then(() => console.log('✅ Todos os comandos de servidor foram excluídos com sucesso.'))
        .catch(console.error);
}
