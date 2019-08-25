let mongoUser = process.env.NESO_MONGO_USER || 'cmsuser'
let mongoPswd = process.env.NESO_MONGO_PSWD || 'notsecure'
let mongoHost = process.env.NESO_MONGO_HOST || 'localhost'
let mongoPort = process.env.NESO_MONGO_PORT || 27017
let mongoSchema = process.env.NESO_MONGO_SCHEMA || 'cmsdb'

module.exports = {
  uri: process.env.NESO_MONGO_URI || `mongodb://${mongoUser}:${mongoPswd}@${mongoHost}:${mongoPort}/${mongoSchema}`,
  dbName: mongoSchema,
  queueName: process.env.NESO_WORKER_QUEUE_NAME|| 'neso_queue',
  cmsUrl: process.env.NESO_CMS_URL || 'http://localhost',
  cmsSecret: process.env.NESO_CMS_SECRET || '8e045a51e4b102ea803c06f92841a1fb',
  workerPollFrequence: process.env.NESO_WORKER_POLL_FREQUENCE || 200,
  workerJobPoolLimit: process.env.NESO_WORKER_JOB_POOL_LIMIT || 10
}