const mongoDbQueue = require('mongodb-queue')
const limit = require('p-limit')

class Worker {

    constructor(mongoClient, action, options) {
        this.mongoClient = mongoClient
        this.action = action
        this.queue = mongoDbQueue(mongoClient.db(options.dbName), options.queueName)
        this.pollFrequence = options.pollFrequence || 200
        this.limitFn = limit(options.jobPoolLimit || 10)
    }

    _poll(callback) {
        let self = this

        self.queue.get((err, msg) => {
            if (err || !msg) {
                errHandler(err)
                return self._schedule(callback)
            }

            try {
                msg.payload = JSON.parse(msg.payload)
            } catch (exp) {
                errHandler(exp)
                return self._schedule(callback)
            }

            self.queue.ack(msg.ack, errHandler)

            callback(err, msg, () => {
                self.queue.clean(errHandler)
                self._poll(callback)
            })
        })
    }

    _schedule(callback) {
        let self = this
        setTimeout(() => {
            self._poll(callback)
        }, self.pollFrequence)
    }

    start() {
        this._poll((err, msg, next) => {
            let action = this.action

            this.limitFn(async () => {
                next()
                return action(err, msg)
            })
        })
    }
}

let errHandler = (err) => {
    err ? console.error(err) : null
}

module.exports = Worker
module.exports.default = Worker