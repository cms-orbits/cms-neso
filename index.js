const mongodb = require('mongodb')
const ObjectID = mongodb.ObjectID
const Worker = require('./worker')
const {
    EntryProcessor,
    EntryDraftProcessor
} = require('./processor')

const {
    uri,
    dbName,
    queueName,
    cmsUrl,
    cmsSecret,
    entryTrxCollectionName,
    draftTrxCollectionName,
    workerPollFrequence,
    workerJobPoolLimit,
} = require('./config')


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

const client = new mongodb.MongoClient(uri, {
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