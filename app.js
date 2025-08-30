import 'dotenv/config';
import express from 'express';
import {
  ButtonStyleTypes,
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { DiscordRequest } from './utils.js';

// Criar o app express
const app = express();
// Definir a porta
const PORT = process.env.PORT || 3000;
// Armazenar as rifas ativas em memória
const activeRaffles = {};

/**
 * Endpoint de interações onde o Discord enviará as requisições HTTP
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const { type, id, data, member } = req.body;

  /**
   * Trata a verificação (PING) do Discord
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Trata os comandos slash
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;
    const userId = member.user.id;

    // Comando "ajuda"
    if (name === 'ajuda') {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '**Como usar o Bot de Rifa:**\n\n1. `/iniciar_rifa [premio]`: Começa uma nova rifa. O prêmio é o que você escrever.\n2. `/sortear [id_da_rifa]`: Sorteia um vencedor. O ID da rifa é enviado quando você a cria.',
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    // Comando "iniciar_rifa"
    if (name === 'iniciar_rifa') {
      const prize = data.options[0].value;
      const raffleId = id; // Usar o ID da interação como ID da rifa

      // Armazena a nova rifa
      activeRaffles[raffleId] = {
        prize: prize,
        creatorId: userId,
        participants: [],
      };

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `🎉 **RIFA INICIADA!** 🎉\n\n**Prêmio:** ${prize}\n\nO criador da rifa, <@${userId}>, pode usar o comando \`/sortear id_da_rifa:${raffleId}\` para escolher o vencedor.\n\nClique no botão abaixo para participar!`,
          components: [
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.BUTTON,
                  custom_id: `enter_raffle_${raffleId}`,
                  label: 'Participar',
                  style: ButtonStyleTypes.SUCCESS, // Botão verde
                },
              ],
            },
          ],
        },
      });
    }

    // Comando "sortear"
    if (name === 'sortear') {
      const raffleId = data.options[0].value;
      const raffle = activeRaffles[raffleId];

      if (!raffle) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: 'Essa rifa não foi encontrada ou já terminou.', flags: InteractionResponseFlags.EPHEMERAL },
        });
      }

      if (raffle.creatorId !== userId) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: 'Apenas quem criou a rifa pode sorteá-la.', flags: InteractionResponseFlags.EPHEMERAL },
        });
      }
      
      const participants = raffle.participants;
      if (participants.length === 0) {
        delete activeRaffles[raffleId]; // Limpa a rifa
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `A rifa para "${raffle.prize}" terminou sem nenhum participante.` },
        });
      }

      // Escolhe um vencedor aleatório
      const winner = participants[Math.floor(Math.random() * participants.length)];
      delete activeRaffles[raffleId]; // Remove a rifa da lista de ativas

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `🎉 O vencedor da rifa para **${raffle.prize}** é... <@${winner.id}>! Parabéns! 🎉`,
        },
      });
    }
  }

  /**
   * Trata interações com componentes (botões)
   */
  if (type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = data;

    if (custom_id.startsWith('enter_raffle_')) {
      const raffleId = custom_id.replace('enter_raffle_', '');
      const raffle = activeRaffles[raffleId];
      const user = member.user;

      if (!raffle) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: 'Esta rifa não está mais ativa.', flags: InteractionResponseFlags.EPHEMERAL },
        });
      }

      // Verifica se o usuário já participou
      if (raffle.participants.some(p => p.id === user.id)) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: 'Você já está participando desta rifa!', flags: InteractionResponseFlags.EPHEMERAL },
        });
      }

      // Adiciona o participante
      raffle.participants.push({ id: user.id, username: user.username });

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `✅ Você entrou na rifa para **${raffle.prize}**! Boa sorte!`, flags: InteractionResponseFlags.EPHEMERAL },
      });
    }
  }
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});