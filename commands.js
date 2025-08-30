import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';

// Comando de ajuda
const AJUDA_COMMAND = {
  name: 'ajuda',
  description: 'Mostra como usar o bot de rifa.',
  type: 1,
  integration_types: [0, 1], // Habilita em servidores e DMs
  contexts: [0, 1, 2],
};

// Comando para iniciar uma rifa
const INICIAR_RIFA_COMMAND = {
  name: 'iniciar_rifa',
  description: 'Inicia uma nova rifa para um prêmio.',
  options: [
    {
      type: 3, // STRING
      name: 'premio',
      description: 'O prêmio que será sorteado.',
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Comando para sortear o vencedor
const SORTEAR_COMMAND = {
    name: 'sortear',
    description: 'Sorteia o vencedor de uma rifa ativa.',
    options: [
        {
            type: 3, // STRING
            name: 'id_da_rifa',
            description: 'O ID da rifa que você quer sortear.',
            required: true,
        },
    ],
    type: 1,
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};


const ALL_COMMANDS = [AJUDA_COMMAND, INICIAR_RIFA_COMMAND, SORTEAR_COMMAND];

// Instala os comandos globalmente
InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);