const mongodb = require('mongodb')
const Promise = require('bluebird')
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
} = require('./config')

const client = new mongodb.MongoClient(uri, {
    useNewUrlParser: true
})

client.connect().then((client) => {
    let worker = new Worker(client, (err, msg) => {
        console.log(`Processing ${msg.id}`)
        return proxyProcess(err, msg.payload)
    }, {
        dbName,
        queueName
    })

    worker.start()
}).catch((err) => {
    console.error('Unable to start worker')
    console.error(err)
})


async function proxyProcess(err, payload) {
    let processor

    switch (payload.kind) {
        case 'entry':
            processor = new EntryProcessor({
                baseUrl: cmsUrl,
                aesSecret: cmsSecret
            })
            break
        case 'draft':
            processor = new EntryDraftProcessor({
                baseUrl: cmsUrl,
                aesSecret: cmsSecret
            })
            break
        default:
            return Promise.resolve('')
    }

    return processor.process(payload)
        .catch(error => {
            console.error("Worker error")
            console.error(error)
        })
}