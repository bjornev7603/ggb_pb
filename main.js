import Widget from './ggbPlaybackWidget.js'
// import Widget from './test.js'

const configFile = 'configA.json'
let currentConfig

let logdata_json
// const configFile = 'configB.json'

const divContainer = document.getElementById('widget-container')
const fileUpload = document.getElementById('config-file')
const fileJsonUpload = document.getElementById('json-log-file')
const setAns = document.getElementById('set-ans')
const playback = document.getElementById('playback')

let ans = {}

setAns.onclick = () => {
  console.log('SETTING ANSWER')
  if (ans.log.length > 0) makeWidget(currentConfig, ans.log)
}
playback.onclick = () => {
  console.log('PLAYBACK')
  if (ans.log.length > 0) makeWidget(currentConfig, ans.log, true)
}

fileUpload.onchange = inn => {
  console.log('SETTING CONFIG')
  let file = fileUpload.files[0]
  let fr = new FileReader()
  fr.onload = evt => {
    let config = JSON.parse(evt.target.result)
    currentConfig = config
    makeWidget(config)
  }
  fr.readAsText(file)
}

fileJsonUpload.onchange = inn => {
  console.log('Getting log data from json')
  let file = fileJsonUpload.files[0]
  let fr = new FileReader()
  fr.onload = evt => {
    let jsonobj = JSON.parse(evt.target.result)
    logdata_json = jsonobj
    console.log(logdata_json)
    makeWidget(currentConfig, logdata_json.log, true)
  }
  fr.readAsText(file)
}

//Onanswer is callback
//Answer is previous
let onAnswer = answer => {
  ans.log = answer
  console.log('ONANSWER')
  console.log(answer)
}

fetch(`./configs/${configFile}`)
  .then(resp => resp.json())
  .then(config => {
    currentConfig = config
    makeWidget(config)
  })

function makeWidget(config, answer = null, playback = false) {
  // Next block only for GeoGebra
  if (window.widget && window.widget.applet)
    window.widget.applet.removeExistingApplet(window.widget.applet.getParameters().id)
  if (divContainer.hasChildNodes()) divContainer.removeChild(divContainer.firstChild)
  delete window.widget
  let divEl = document.createElement('div')
  divEl.id =
    'widget' +
    Math.random()
      .toString(36)
      .substring(2, 15)
  divContainer.append(divEl)
  window.widget = new Widget(divEl.id, config, answer, onAnswer, { playback: playback })
}
