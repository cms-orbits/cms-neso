let mongoUser = process.env.SAO_MONGO_USER || 'cmsuser'
let mongoPswd = process.env.SAO_MONGO_PSWD || 'notsecure'
let mongoHost = process.env.SAO_MONGO_HOST || 'localhost'
let mongoPort = process.env.SAO_MONGO_PORT || 27017
let mongoSchema = process.env.SAO_MONGO_SCHEMA || 'cmsdb'

module.exports = {
  uri: process.env.SAO_MONGO_URI || `mongodb://${mongoUser}:${mongoPswd}@${mongoHost}:${mongoPort}/${mongoSchema}`,
  dbName: mongoSchema,
  queueName: process.env.SAO_WORKER_QUEUE_NAME|| 'sao_queue',
  cmsUrl: process.env.SAO_CMS_URL || 'http://localhost',
  cmsSecret: process.env.SAO_CMS_SECRET || '8e045a51e4b102ea803c06f92841a1fb'
}