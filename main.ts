import {
    MatrixClient,
    AutojoinRoomsMixin,
    SimpleFsStorageProvider,
    RustSdkCryptoStorageProvider
} from "matrix-bot-sdk"
import util from "util"
import dotenv from "dotenv"
import { Command } from "commander"
import { Configuration, OpenAIApi, ChatCompletionRequestMessage } from "openai"

import { logger } from "./src/logger"
import { Message, MessageStorageProvider } from "./src/storage"

function makeChatMessages(botUserId: string, msgContext: Message[]) {
    const messages = new Array<ChatCompletionRequestMessage>()
    for (let msg of msgContext) {
        messages.push({
            "role": msg.sender == botUserId ? 'assistant' : 'user',
            "content": msg.text,
        })
    }

    return messages
}

async function run() {
    const { HOMESERVER, ACCESS_TOKEN } = process.env;
    const messageProvider = new MessageStorageProvider("./data/messages")
    const storageProvider = new SimpleFsStorageProvider("./data/bot.json")
    const cryptoProvider = new RustSdkCryptoStorageProvider("./data/directory")
    const client = new MatrixClient(HOMESERVER as string, ACCESS_TOKEN as string, storageProvider, cryptoProvider)
    const botUserId = await client.getUserId()

    const { OPENAI_API_KEY, OPENAI_API_MODEL } = process.env
    const configuration = new Configuration({ apiKey: OPENAI_API_KEY })
    const openai = new OpenAIApi(configuration)

    client.on("room.message", async (roomId: string, event: any) => {
        if (event['content']?.['msgtype'] !== 'm.text') {
            return
        }

        const sender = event['sender'] as string
        const message = event['content']['body'] as string
        await messageProvider.put(roomId, { sender, text: message })

        if (event['sender'] === botUserId) {
            return
        }

        const msgContext = await messageProvider.tail(roomId, 10)
        const messages = makeChatMessages(botUserId, msgContext)

        try {
            const response = await openai.createChatCompletion({
                model: OPENAI_API_MODEL as string,
                max_tokens: 2048,
                temperature: 1,
                messages
            })

            const usage = util.inspect(response.data.usage)
            logger.info(`Chat Completion, sender: ${sender}, usage: ${usage}}`, )

            if (response.data.choices[0].message) {
                await client.sendText(roomId, response.data.choices[0].message.content)
            }
        } catch (error) {
            logger.error(`Failed to create chat completion, reason: ${error}`)
            await client.sendText(roomId, "The server is busy, please try again later.")
        }
    })

    AutojoinRoomsMixin.setupOnClient(client)

    client.start().then(() => {
        logger.info(`Bot started, user: ${botUserId}`)
    })
}

async function getAccessToken(homeserverUrl: string, user: string, password: string) {
    const remplateClient = new MatrixClient(homeserverUrl, "")

    const body = {
        type: "m.login.password",
        identifier: {
            type: "m.id.user",
            user: user,
        },
        password: password
    };

    const response = await remplateClient.doRequest("POST", "/_matrix/client/v3/login", null, body);
    const accessToken = response["access_token"];
    if (!accessToken) throw new Error("Expected access token in response - got nothing");

    if (response['well_known'] && response['well_known']['m.homeserver'] && response['well_known']['m.homeserver']['base_url']) {
        homeserverUrl = response['well_known']['m.homeserver']['base_url'];
    }

    return { homeserverUrl, accessToken }
}

async function main() {
    dotenv.config()

    const program = new Command()
    program.command('run')
        .action(run)
    program.command('login')
        .description('Login to get access token')
        .argument('<homeserverUrl>')
        .argument('<username>')
        .argument('<password>')
        .action(async (homeserver: string, username: string, password: string) => {
            const { homeserverUrl, accessToken } = await getAccessToken(homeserver, username, password)
            console.info(`homeserverUrl: ${homeserverUrl}, accessToken: ${accessToken}`)
        })

    program.parse()
}

main()
