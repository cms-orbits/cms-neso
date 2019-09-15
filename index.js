const config = require("config")
const mongodb = require('mongodb')
const ObjectID = mongodb.ObjectID
const Worker = require('./worker')
const { EntryProcessor,EntryDraftProcessor} = require('./processor')

const dbName = config.get('mongo.schema')
const queueName = config.get('queue.name')
const cmsUrl = config.get('cms.url')
const cmsSecret = config.get('cms.secret')
const entryTrxCollectionName = config.get('sao.storage.entry.name')
const draftTrxCollectionName = config.get('sao.storage.draft.name')
const workerPollFrequence = config.get('worker.poll.frequency')
const workerJobPoolLimit = config.get('worker.pool.limit')

const mongoUri = 'mongodb://' +
                    config.get('mongo.user') + ':' +
                    config.get('mongo.pswd') + '@' +
                    config.get('mongo.host') + ':' + 
                    config.get('mongo.port') + '/' +
                    config.get('mongo.schema')

async function proxyProcess(err, payload, opts) {
    let processor

    switch (payload.kind) {
        case 'entry':
            processor = new EntryProcessor({
                baseUrl: cmsUrl,
                aesSecret: cmsSecret,
                trxUpdater: opts.trxUpdater(entryTrxCollectionName),
            })
            break
        case 'draft':
            processor = new EntryDraftProcessor({
                baseUrl: cmsUrl,
                aesSecret: cmsSecret,
                trxUpdater: opts.trxUpdater(draftTrxCollectionName),
            })
            break
        default:
            return ''
    }

    return processor.process(payload)
        .catch(error => {
            console.error("Worker error")
            console.error(error)
        })
}

const client = new mongodb.MongoClient(mongoUri, {
    useNewUrlParser: true
})

client.connect().then((client) => {

    let entryUpdate = (collectionName = 'default') => {
        let col = client.db(dbName).collection(collectionName)
        return async (id, document) => {
            if (!document) {
                return
            }

            console.log(`Updating ${id} ${JSON.stringify(document)}`)
            document.updatedAt = new Date()

            return col.updateOne({
                _id: ObjectID(id)
            }, {
                $set: document
            }).catch(console.error)
        }
    }

    let worker = new Worker(client, (err, msg) => {
        console.log(`Processing ${msg.id}`)
        return proxyProcess(err, msg.payload, {
            trxUpdater: entryUpdate
        })
    }, {
        dbName: dbName,
        queueName: queueName,
        pollFrequence: workerPollFrequence,
        jobPoolLimit: workerJobPoolLimit,
    })

    worker.start()
}).catch((err) => {
    console.error('Unable to start worker')
    console.error(err)
})