'use strict'

const axios = require("axios")
const chromium = require("chrome-aws-lambda");

// 取得したい路線情報
const CHECK_LIST = [
    {
        'name': '常磐線',
        'company': 'JR東日本',
        'website': 'https://traininfo.jreast.co.jp/train_info/tohoku.aspx',
        'selector': async (page) => await selectorForJrEast(page, '常磐線')
    },
    {
        'name': '仙山線',
        'company': 'JR東日本',
        'website': 'https://traininfo.jreast.co.jp/train_info/tohoku.aspx',
        'selector': async (page) => await selectorForJrEast(page, '仙山線')
    },
    {
        'name': '仙石線',
        'company': 'JR東日本',
        'website': 'https://traininfo.jreast.co.jp/train_info/tohoku.aspx',
        'selector': async (page) => await selectorForJrEast(page, '仙石線')
    },
    {
        'name': '仙石東北ライン',
        'company': 'JR東日本',
        'website': 'https://traininfo.jreast.co.jp/train_info/tohoku.aspx',
        'selector': async (page) => await selectorForJrEast(page, '仙石東北ライン')
    },
    {
        'name': '東北本線',
        'company': 'JR東日本',
        'website': 'https://traininfo.jreast.co.jp/train_info/tohoku.aspx',
        'selector': async (page) => await selectorForJrEast(page, '東北本線')
    },
    {
        'name': '仙台市営地下鉄',
        'company': '仙台市交通局',
        'website': 'https://www.kotsu.city.sendai.jp/unkou/',
        'selector': async (page) => await selectorForSendaiSubway(page)
    },
]

module.exports.sendToSlack = async () => {
    // 鉄道運行遅延の情報を取得
    const notifyDelays = await getNotifyDelays()
    if (notifyDelays.length == 0) {
        console.log('遅延情報はありませんでした。')
        return;
    }
    console.log('遅延情報が見つかりました。' + notifyDelays)

    // 遅延内容を取得
    const messages = await getDelayMessage(notifyDelays)
    console.log(messages.join('\n'))

    // Sclackに送信
    await postSlack(messages.join('\n'))
}

/**
 * 遅延情報を取得
 */
async function getNotifyDelays() {
    const delay_url = process.env['TRAIN_DELAY_JSON_URL']
    const notifyDelays = []

    try {
        // 運行遅延情報を取得
        const res = await axios.get(delay_url)
        // res = [{
        //     "name":"東北本線",
        //     "company":"JR東日本",
        //     "lastupdate_gmt":1578638905,
        //     "source":"鉄道com RSS"
        // }]

        // 通知する路線のみ抽出
        res.data.forEach(delayItem => {
            CHECK_LIST.forEach(checkItem => {
                if (delayItem.name == checkItem.name && delayItem.company == checkItem.company) {
                    notifyDelays.push(checkItem)
                }
            })
        })
    } catch (error) {
        console.error(error)
    }

    return notifyDelays
}

/**
 * 遅延メッセージを取得
 * 
 * @param {Array} delays 
 */
async function getDelayMessage(delays) {
    const messages = [];
    let browser = null
    try {
        browser = await chromium.puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless
          })
        const page = await browser.newPage()

        for(const i of delays) {
            // websiteから遅延情報をスクレイピング
            await page.goto(i.website)
            const detail = await i.selector(page)
            const message = `*・${i.company} \<${i.name}\>* (<${i.website}|jump>)\n ${detail}\n`
            messages.push(message)
        }
    } catch(e) {
        console.warn(e)
    } finally {
        if (browser !== null) {
            await browser.close()
        }
    }

    return messages; 
}

/**
 * JR東日本（東北エリア）の遅延内容をスクレイピング
 * 
 * @param {Page} page Page
 * @param {string} target 路線名
 */
async function selectorForJrEast(page, target) {
    const selector = '#wrapper > div.main_con02 > div.table_access > table > tbody > tr'
    const messages = []
    try {
        for (const item of await page.$$(selector)) {
            const lineName = await getTextContext(item, '.line_name')
            if (lineName == target) {
                const message = await getTextContext(item, '.status_text')
                messages.push(message)
            }
        }
    } catch (error) {
        console.error(error)
        return `:warning: ノードの取得に失敗しました。DOMが変更されている可能性があります。\n  \`${selector}\` `
    }

    return messages.join('\n')
}

/**
 * 仙台市地下鉄（南北・東西）の遅延内容をスクレイピング
 * 
 * @param {Page} page Page
 */
async function selectorForSendaiSubway(page) {
    const selector = '#unkou_detail'

    try {
        const item = await page.$(selector)
        const text = await getTextContext(item)
        if (text == null) {
            return `:warning: ノードの取得に失敗しました。DOMが変更されている可能性があります。\n  \`${selector}'\` `
        }
    } catch (error) {
        console.error(error)
        return `:warning: ノードの取得に失敗しました。DOMが変更されている可能性があります。\n  \`${selector}'\` `
    }

    return text
}

/**
 * textContent取得
 * 
 * @param {ElementHandle} elementHandle 
 * @param {string} target 
 */
async function getTextContext(elementHandle, target) {
    const tag = await elementHandle.$(target)
    const prop = await tag.getProperty('textContent')
    const text = await prop.jsonValue()
    return text
}

/**
 * Slackへ送信
 * 
 * @param {string} message 
 */
async function postSlack(message) {
    const slack_url = process.env['SLACK_WEBHOOK_URL']
    const payload = {
        'username': '運行遅延お知らせbot',
        'icon_emoji': ':train:',
        'attachments': [
            {
                'fallback': message,
                'color': '#36a64f',
                'pretext': '<!channel> 電車の遅延があります。',
                'text': message,
                "mrkdwn_in": [
                    "text"
                ],
                'channel': '#列車運行情報'
            }
        ]
    }
    
    const res = await axios.post(slack_url, payload)
    console.log(res)
}