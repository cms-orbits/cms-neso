const aesjs = require('aes-js')
const backoff = require('backoff');
const cheerio = require('cheerio')
const Promise = require('bluebird')
const request = require('request-promise')
const qs = require('querystring')

const CMS_COMPILATION_FAILED = 2
const CMS_SCORED = 5
// const CMS_COMPILING = 1
// const CMS_EVALUATING = 3
// const CMS_SCORING = 4

const CMS_DRAFT_COMPILATION_FAILED = 2
const CMS_DRAFT_EVALUATED = 4
// const CMS_DRAFT_COMPILING = 1
// const CMS_DRAFT_EXECUTING = 3

class EntryProcessor {

    constructor(options = {}) {
        this.baseUrl = options.baseUrl
        this.cookieJar = request.jar()

        this.trxCollection = options.trxCollection || 'entry_trx'

        this.backoffInitialDelay = options.backoffInitialDelay || 200
        this.backoffThreshold = options.backoffThreshold || 20

        this.aesSecret = options.aesSecret || ''
    }

    async process(payload) {
        this.cookieJar.setCookie(request.cookie(payload.cookie), this.baseUrl)

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
        return request({
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

        return request.post({
            url: url,
            jar: this.cookieJar,
            followAllRedirects: true,
            resolveWithFullResponse: true,
            formData: payload,
        }).then(res => {
            let urlParams = qs.parse(res.request.uri.query)
            let encryptedEntryID = urlParams["submission_id"].replace(".", "=")

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

                request({
                    url: url,
                    jar: self.cookieJar,
                    transform: body => {
                        return cheerio.load(body)
                    }
                }).then($ => {
                    let target = $(`#submission_list tbody tr[data-submission='${relativeID}']`)
                    let status = target.data('status')

                    switch (status) {
                        case CMS_COMPILATION_FAILED:
                            reject('Cannot submit token on entry with failed compilation')
                            return
                        case CMS_SCORED:
                            resolve($('input[name=_xsrf]', target).val())
                            return
                    }

                    fbBackoff.backoff()
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

        return request.post({
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

class EntryDraftProcessor {

    constructor(options = {}) {
        this.baseUrl = options.baseUrl
        this.cookieJar = request.jar()

        this.trxCollection = options.trxCollection || 'draft_trx'

        this.backoffInitialDelay = options.backoffInitialDelay || 200
        this.backoffThreshold = options.backoffThreshold || 20

        this.aesSecret = options.aesSecret || ''
    }

    async process(payload) {
        this.cookieJar.setCookie(request.cookie(payload.cookie), this.baseUrl)

        return this.getEntryDraftXSRF(payload.contestSlug, payload.taskSlug)
            .then((xsrf) => {
                let form = {
                    '_xsrf': xsrf,
                    'language': payload.language,
                    'input': {
                        value: payload.draftInput,
                        options: {
                            filename: 'input.txt',
                            contentType: 'plain/text'
                        }
                    }
                }
                form[payload.filename] = payload.file

                return this.postEntryDraft(payload.contestSlug, payload.taskSlug, form)
            })
            .then(({
                relativeDraftID,
                encryptedDraftID
            }) => {
                return Promise.all([
                    Promise.resolve(parseInt(decryptString(encryptedDraftID, this.aesSecret), 16)),
                    Promise.resolve(relativeDraftID),
                    this.monitorDraftStatus(payload.contestSlug, payload.taskSlug, relativeDraftID)
                ])
            })
    }

    async getEntryDraftXSRF(contestSlug, taskSlug) {
        let url = `${this.baseUrl}/${contestSlug}/testing`
        return request({
            url: url,
            jar: this.cookieJar,
            transform: body => {
                return cheerio.load(body)
            }
        }).then($ => {
            let xsrf = $(`#test_${taskSlug} input[name=_xsrf]`).val()

            if (!xsrf) {
                throw new Error(`Could not fetch xsrf for draft in ${url}`)
            }

            return xsrf
        })
    }

    async postEntryDraft(contestSlug, taskSlug, payload) {
        let url = `${this.baseUrl}/${contestSlug}/tasks/${taskSlug}/test`

        return request.post({
            url: url,
            jar: this.cookieJar,
            followAllRedirects: true,
            resolveWithFullResponse: true,
            formData: payload,
        }).then(res => {
            let urlParams = qs.parse(res.request.uri.query)
            let encryptedEntryID = urlParams["user_test_id"].replace(".", "=")

            let $ = cheerio.load(res.body)
            let target = $(`table[data-task='${taskSlug}'] tbody tr:first-child`)

            let relativeID = target.data('user-test')
            let draftStatusCode = target.data('status')

            return {
                relativeDraftID: relativeID,
                encryptedDraftID: encryptedEntryID,
                draftStatus: draftStatusCode
            }
        })
    }

    async monitorDraftStatus(contestSlug, taskSlug, relativeID) {
        let fbBackoff = backoff.exponential({
            randomisationFactor: 0,
            initialDelay: this.backoffInitialDelay,
        });

        fbBackoff.failAfter(this.backoffThreshold);

        let self = this
        return new Promise(function (resolve, reject) {
            fbBackoff.on('ready', () => {
                let url = `${self.baseUrl}/${contestSlug}/testing`

                request({
                    url: url,
                    jar: self.cookieJar,
                    transform: body => {
                        return cheerio.load(body)
                    }
                }).then($ => {
                    let target = $(`table[data-task='${taskSlug}'] tr[data-user-test='${relativeID}']`)
                    let status = target.data('status') || 0

                    if ([CMS_DRAFT_COMPILATION_FAILED, CMS_DRAFT_EVALUATED].includes(status)) {
                        resolve(status)
                        return
                    }

                    fbBackoff.backoff()
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

module.exports = {
    EntryProcessor,
    EntryDraftProcessor
}