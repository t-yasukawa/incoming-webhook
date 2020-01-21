'use strict'

const axios = require("axios")

const appId = process.env['YOLP_APP_ID']
const lat = process.env['TARGET_LAT']
const lon = process.env['TARGET_LON']

module.exports.sendToSlack = async () => {

    // 降雨情報取得
    let weathers = await getWeathers()
    weathers = weathers.filter(w => w.Rainfall > 0)
    if (weathers.length == 0) {
        console.log('降雨情報はありませんでした。')
        return
    }

    console.log('降雨情報がありました。')
    console.log(weathers)
    // let weathers = [
    //     { Type: 'observation', Date: '202001161240', Rainfall: 10.21 },
    //     { Type: 'forecast', Date: '202001161250', Rainfall: 7.89 },
    //     { Type: 'forecast', Date: '202001161300', Rainfall: 5.66 },
    //     { Type: 'forecast', Date: '202001161310', Rainfall: 1.20 },
    //     { Type: 'forecast', Date: '202001161320', Rainfall: 1.20 },
    //     { Type: 'forecast', Date: '202001161330', Rainfall: 0 },
    //     { Type: 'forecast', Date: '202001161340', Rainfall: 0 }
    // ]

    // メッセージ
    const weather = weathers[0]
    const message = (weather.Type == 'observation') ? 
                    '現在' + getRainMessage(weather.Rainfall) + 'が降っています。' :
                    '今後１時間以内に' + getRainMessage(weather.Rainfall) + 'が予想されています。'

    // Sclackに送信
    await postSlack(message)
}

/**
 * 降雨情報取得（直近１時間）
 */
async function getWeathers() {
    const url = process.env['YOLP_WEATHER_URL']

    let weathers = []
    try {
        // https://developer.yahoo.co.jp/webapi/map/openlocalplatform/v1/weather.html#response_field
        const res = await axios.get(url , {
            params: {
                coordinates: `${lon},${lat}`,
                appid: appId,
                output: 'json'
            }
        })
        weathers = res.data.Feature[0].Property.WeatherList.Weather
    } catch (error) {
        console.error(error)
    }

    return weathers
}

/**
 * 雨の強度
 * 
 * @param {Array} rainfall 
 */
function getRainMessage(rainfall) {
    let message = ` \`${rainfall} mm/h\` の`

    if (rainfall >= 80.0) {
        message += '猛烈な雨'
    } else if(rainfall >= 50.0) {
        message += '非常に激しい雨'
    } else if(rainfall >= 30.0) {
        message += '激しい雨'
    } else if(rainfall >= 20.0) {
        message += '強い雨'
    } else if(rainfall >= 10.0) {
        message += 'やや強い雨'
    } else {
        message += '雨'
    }

    return message
}

/**
 * Slackへ送信
 * 
 * @param {string} message 
 */
async function postSlack(message) {
    const slackUrl = process.env['SLACK_WEBHOOK_URL']
    const place = process.env['TARGET_PLACE']
    
    const imageUrl = `${process.env['YOLP_MAP_URL']}?appid=${appId}&lat=${lat}&lon=${lon}&z=15&width=600&height=600&overlay=type:rainfall|datelabel:off`

    const payload = {
        'username': '降雨お知らせbot',
        'icon_emoji': ':umbrella:',
        'attachments': [
            {
                'color': '#0000dd',
                'pretext': `<!channel> ${place}で${message}`,
                'image_url': imageUrl
            }
        ]
    }
    
    const res = await axios.post(slackUrl, payload)
    console.log(res)
}