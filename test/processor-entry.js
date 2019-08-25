const tap = require('tap')
const nock = require('nock')
const {
    EntryProcessor
} = require('../processor')

tap.beforeEach((done, test) => {
    test.subject = new EntryProcessor({
        baseUrl: 'http://cmsurl.test',
        trxCollection: 'test_entry_trx',
        backoffInitialDelay: 20,
        backoffThreshold: 5,
        aesSecret: 'secret1234567890'
    })
    done()
})

tap.test('When get Entry XSRF succed', async t => {
    const taskSlug = 'foobar'
    const contestSlug = 'test_test'
    const stubXSRF = 'pseudo-token'

    nock(t.subject.baseUrl)
        .get(`/${contestSlug}/tasks/${taskSlug}/submissions`)
        .reply(200, `
<div id="submit_solution" class="row">
<form class="form-horizontal" enctype="multipart/form-data" action="${contestSlug}/tasks/${taskSlug}/submit" method="POST">
<input type="hidden" name="_xsrf" value="${stubXSRF}">
</form>
</div>`)

    return t.equal(await t.subject.getEntryXSRF(contestSlug, taskSlug), stubXSRF)
})