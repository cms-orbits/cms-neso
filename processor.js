const rp = require('request-promise')
const cheerio = require('cheerio')
var backoff = require('backoff');

const fs = require('fs')
const aesjs = require('aes-js')
const Promise = require('bluebird')


const CMS_COMPILATION_FAILED = 2
const CMS_COMPILING = 1
const CMS_EVALUATING = 3
const CMS_SCORING = 4
const CMS_SCORED = 5


class EntryProcessor {

    constructor(options = {}) {
        this.baseUrl = options.baseUrl
        this.cookieJar = rp.jar()

        this.entryTrxCol = options.entryTrxCol || 'entry_trx'

        this.backoffInitialDelay = options.backoffInitialDelay || 200
        this.backoffThreshold = options.backoffThreshold || 20

        this.aesSecret = options.aesSecret || ''
    }

    async process(payload) {
        this.cookieJar.setCookie(rp.cookie(payload.cookie), this.baseUrl)

        let requestCoordinates = {
            baseUrl: this.baseUrl,
            cookieJar: this.cookieJar,
            contestSlug: payload.contestSlug,
            taskSlug: payload.taskSlug,
        }

        return this.getEntryXSRF(payload.contestSlug, payload.taskSlug)
            .then(xsrfToken => {
                let entryForm = {
                    '_xsrf': xsrfToken,
                    'language': payload.language,
                }
                entryForm[payload.filename] = payload.file

                return this.postEntry(payload.contestSlug, payload.taskSlug, entryForm)
            })
            .then(({
                relativeEntryID,
                encryptedEntryID
            }) => {
                return Promise.all([
                    Promise.resolve(parseInt(decryptString(encryptedEntryID, this.aesSecret), 16)),
                    Promise.resolve(relativeEntryID),
                    this.getEntryTokenXSRF(payload.contestSlug, payload.taskSlug, relativeEntryID)
                ])
            })
            .then(data => {
                console.log(`Entry ID: ${data[0]}, Relative ID: ${data[1]}`)
                this.postEntryToken(payload.contestSlug, payload.taskSlug, data[1], data[2])
            })
    }

    async getEntryXSRF(contestSlug, taskSlug) {
        let url = `${this.baseUrl}/${contestSlug}/tasks/${taskSlug}/submissions`
        return rp({
            url: url,
            jar: this.cookieJar,
            transform: body => {
                return cheerio.load(body)
            }
        }).then($ => {
            let xsrf = $('#submit_solution input[name=_xsrf]').val()

            if (!xsrf) {
                throw new Error(`Could not fetch xsrf for ${url}`)
            }

            return xsrf
        })
    }

    async postEntry(contestSlug, taskSlug, payload) {
        let url = `${this.baseUrl}/${contestSlug}/tasks/${taskSlug}/submit`

        return rp.post({
            url: url,
            jar: this.cookieJar,
            followAllRedirects: true,
            resolveWithFullResponse: true,
            formData: payload,
        }).then(res => {
            let encryptedEntryID = res.request.uri.query.replace("submission_id=", '').replace(".", "=")

            let $ = cheerio.load(res.body)
            let currentDOM = $('#submission_list tbody tr:first-child')
            let relativeID = currentDOM.data('submission')
            let entryStatusCode = currentDOM.data('status')

            return {
                relativeEntryID: relativeID,
                encryptedEntryID: encryptedEntryID,
                entryStatus: entryStatusCode
            }
        })
    }

    async getEntryTokenXSRF(contestSlug, taskSlug, relativeID) {
        let fbBackoff = backoff.exponential({
            randomisationFactor: 0,
            initialDelay: this.backoffInitialDelay,
        });

        fbBackoff.failAfter(this.backoffThreshold);

        let self = this
        return new Promise(function (resolve, reject) {
            fbBackoff.on('ready', () => {
                let url = `${self.baseUrl}/${contestSlug}/tasks/${taskSlug}/submissions`

                rp({
                    url: url,
                    jar: self.cookieJar,
                    transform: body => {
                        return cheerio.load(body)
                    }
                }).then($ => {
                    let target = $(`#submission_list tbody tr[data-submission='${relativeID}']`)
                    let status = target.data('status')

                    if (status == CMS_COMPILATION_FAILED) {
                        reject('Cannot submit token on entry with failed compilation')
                        return
                    }

                    if ([CMS_COMPILING, CMS_EVALUATING, CMS_SCORING].includes(status)) {
                        fbBackoff.backoff()
                        return
                    }

                    resolve($('input[name=_xsrf]', target).val())
                }).catch(() => {
                    fbBackoff.backoff()
                })
            });

            fbBackoff.on('fail', () => {
                reject('Reached max amount of attempts')
            });

            fbBackoff.backoff()
        });
    }

    async postEntryToken(contestSlug, taskSlug, relativeID, xsrf) {
        let url = `${this.baseUrl}/${contestSlug}/tasks/${taskSlug}/submissions/${relativeID}/token`
    
        return rp.post({
            url: url,
            jar: this.cookieJar,
            followAllRedirects: true,
            resolveWithFullResponse: true,
            formData: {
                '_xsrf': xsrf
            },
        }).then(res => {
            let $ = cheerio.load(res.body)
    
            let target = $(`#submission_list tbody tr[data-submission='${relativeID}']`)
                .find('input[name=_xsrf]')
    
            if (target.length > 0) {
                console.error(`There should not be a token available for ${url}`)
            }
    
            return
        })
    }
}

function decryptString(encryptedHex, secret = '') {
    const key = aesjs.utils.hex.toBytes(secret)

    let ivWithText = Buffer.from(encryptedHex, 'base64')
    let iv = ivWithText.slice(0, 16)
    let encryptedBytes = ivWithText.slice(16)

    // CBC operations maintain internal state, so a new instance must be instantiated.
    let aesCbc = new aesjs.ModeOfOperation.cbc(key, iv)
    let paddedBytes = aesCbc.decrypt(encryptedBytes)

    return Buffer.from(paddedBytes).toString()
}

let dummyProcessor = new EntryProcessor({
    baseUrl: 'http://192.168.7.10',
    aesSecret: '8e045a51e4b102ea803c06f92841a1fb', // not so secret :P
    entryTrxCol: 'entry_trx'
})

dummyProcessor.process({
        contestSlug: 'con_test',
        taskSlug: 'batch',
        cookie: `con_test_login=2|1:0|10:1566191758|14:con_test_login|68:KFZ1MgpwMApWcGxhaW50ZXh0OnAyCnAxCkYxNTY2MTkxNzU4Ljg0Mzc2MQp0cDIKLg==|46f643ef681ceb86bc7bb02d1e1cde345a028eea9b22aea11677db07aefa1f29`,
        file: fs.createReadStream(__dirname + '/tmp/solution.cpp'),
        language: 'C++11 / g++',
        filename: 'batch.%l'
    }).then(() => {
        console.log('The end')
    })
    .catch(error => {
        console.log("woops >>>>>>>>")
        console.error(error)
    })