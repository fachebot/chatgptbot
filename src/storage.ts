import * as path from "path"
import * as mkdirp from "mkdirp"
import LevelDOWN from "leveldown"
import LevelUP, { LevelUp } from "levelup"

interface Pair {
    key: Buffer,
    value: Buffer
}

export interface Message {
    sender: string
    text: string
}

export class MessageStorageProvider {
    private db: LevelUp

    constructor(public readonly storagePath: string) {
        this.storagePath = path.resolve(this.storagePath)
        mkdirp.mkdirpSync(storagePath)
        const db = LevelUP(LevelDOWN(storagePath))
        if (!db) {
            throw new Error("open level db failed")
        }
        this.db = db
    }

    public async put(roomId: string, msg: Message): Promise<void> {
        const id = Date.now()
        const data = JSON.stringify(msg)
        await this.db.put(`room:${roomId}:${id}`, data)
    }

    public async tail(roomId: string, limit: number): Promise<Message[]> {
        const prefix = `room:${roomId}:`
        const opts = {
            gte: prefix,
            lt: `${prefix}\uffff`,
            reverse: true,
            limit
        }

        const messages = new Array<Message>()
        const iterator = this.db.createReadStream(opts)
        for await (const item of iterator) {
            const { value } = item as any as Pair
            messages.push(JSON.parse(value.toString()) as Message)
        }

        return messages.reverse()
    }
}