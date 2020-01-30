export default class GgbWidget {
  // class GgbWidget {
  constructor(divElementId, config, answer = null, onAnswer, options) {
    this.divElementId = divElementId

    this.eventHandlers = {
      ADD: arg => this.draw_ggb(arg),
      UPDATE: arg => this.draw_ggb(arg),
      CLEAR_ANIMATIONS: () => this.clearAnimations()
    }

    this.ggbId = `${this.divElementId}GGBcontainer`
    // default values
    let parameters = {
      id: divElementId,
      width: document.getElementById(divElementId).clientWidth < 800 ? 600 : 800,
      // width: 600,
      height: 450,
      // borderColor: null,
      showMenuBar: false,
      // showAlgebraInput: false,
      showToolBar: false,
      // customToolbar: '0|1', //see https://wiki.geogebra.org/en/Reference:Toolbar for codes
      showResetIcon: false,
      enableLabelDrags: false,
      enableShiftDragZoom: true,
      enableRightClick: false,
      // enableCAS: false,
      // capturingThreshold: null,
      // appName: 'graphing',
      showToolBarHelp: false,
      errorDialogsActive: true,
      useBrowserForJS: false,
      autoHeight: true,
      language: 'nb'
      // showLogging: 'true' //only for testing/debugging
    }
    // overwrite default values with values passed down from config
    // this.config.parameters = { ...parameters, ...config.ggbApplet }
    this.config = {
      ggbApplet: { ...parameters, ...config.ggbApplet },
      feedback: config.feedback || null,
      vars: config.vars || []
    }

    this.vars = {}
    this.answer = answer || { log: [], states: [] }
    this.onAnswer = onAnswer
    if (options.playback) {
      this.playback = options.playback
    }

    this.buildDOM()
    this.config.ggbApplet.appletOnLoad = this.appletOnLoad

    if (!this.playback) {
      this.setAns()
    } else {
      this.state = {
        next: this.answer[0].action,

        current: 0,
        forward: () => {
          let action = this.state.next,
            index = this.state.current
          this.state.current = (this.state.current + 1) % this.answer.length
          this.state.next = this.answer[this.state.current].action

          return { action: action, index: index }
        }
      }
    }
    window.onload = this.runscript()
  }

  draw_ggb(arg) {
    let logg = '',
      xx = '',
      yy = ''
    logg = this.answer[arg]
    if (logg.object_type == 'point') {
      //Create Points: x and y pos either string or array
      xx = typeof logg.data.x === 'object' ? logg.data.x[logg.data.x.length - 1] : logg.data.x
      yy = typeof logg.data.y === 'object' ? logg.data.x[logg.data.y.length - 1] : logg.data.y
      this.api.evalCommand(logg.object_name + '= (' + xx + ', ' + yy + ')')
    }

    if (logg.object_type == 'segment' || logg.object_type == 'line') {
      let descr = logg.data.definition_string
      //description values not in log, must fetch objects in def_string for now
      let elems = descr.split(' ')
      let b1 = elems[1].includes(',') ? elems[1].slice(0, elems[1].indexOf(',')) : elems[1]
      let b2 = elems[2]

      if (logg.object_type == 'segment') {
        //create Segment
        this.api.evalCommand(logg.object_name + '= Segment(' + b1 + ',' + b2 + ')')
      }
      if (logg.object_type == 'line') {
        if (descr.indexOf('Midtnormal') == -1) {
          //create Line
          this.api.evalCommand(logg.object_name + '= Line(' + b1 + ',' + b2 + ')')
        } else {
          //Create PerpendicularBisector (midtnormal)
          this.api.evalCommand(logg.object_name + '= PerpendicularBisector(' + b1 + ')')
        }
      }
    }
  }

  clearAnimations() {
    //todo
  }

  addUpdateListener = (api, name, type, vars = false, aux = false) => {
    const appendVar = (objName = name) => {
      let value = api.getValue(objName)
      if (!isNaN(value) && value !== null) {
        this.vars[name] = value
      }
      if (type == 'point') {
        let x = api.getXcoord(objName),
          y = api.getYcoord(objName)

        this.vars[name + 'x'] = x
        this.vars[name + 'y'] = y
      }
    }
    let listener = objName => {
      if (vars) appendVar(objName)
      if (!aux && !this.playback) this.logger(api, name)
    }
    api.registerObjectUpdateListener(name, _debounced(250, listener))
    appendVar()
  }
  /**
   * Logs action to the answer.log array
   */

  logger = (api, objName = null, action = 'UPDATE') => {
    let log = {
      action: action,
      time: Date.now(),
      delta_time: this.answer.log.length
        ? Date.now() - this.answer.log[this.answer.log.length - 1].time
        : null
    }
    let type = api.getObjectType(objName)
    if (objName) {
      log.object_name = objName
      log.object_type = type
    }
    if (action === 'ADD') this.addUpdateListener(api, objName, type)
    log.command = api.getValueString(objName)
    let data = {}
    let value = api.getValue(objName)
    if (value !== NaN && value !== null) data.value = value
    if (type === 'point') {
      data = {
        x: api.getXcoord(objName).toFixed(5),
        y: api.getYcoord(objName).toFixed(5)
      }
    } else if (type === 'angle') {
      data.value *= 180 / Math.PI
    }
    let def = api.getDefinitionString(objName)
    if (def !== '') data['definition_string'] = def
    if (Object.keys(data).length > 0) log.data = data
    this.answer.log.push(log)
    this.setAns()
  }

  appletOnLoad = api => {
    //get A and B line points from answer log
    this.api = api

    const addListener = objName => {
      s
      this.logger(api, objName, 'ADD')
    }
    if (!this.playback) {
      api.registerAddListener(addListener)
    }

    //const clearListener = () => {
    //      this.logger(api, null, 'RESET')
    //}
    //api.registerClearListener(clearListener)

    // const clickListener = obj => {
    // 	console.log(obj)
    // }
    // api.registerClickListener(clickListener)

    const clientListener = evt => {
      if (evt[0] == 'removeMacro') this.logger(api, null, 'RESET')
    }
    api.registerClientListener(clientListener)

    for (let o of this.config.vars) {
      this.addUpdateListener(api, o.name, o.type, true, o.aux)
    }
    api.recalculateEnvironments()
  }

  setAns() {
    this.onAnswer(this.answer)
  }

  buildDOM() {
    if (this.playback) this.buildPlayback()
    // else this.buildMenu()

    let parent = document.getElementById(this.divElementId)
    parent.setAttribute('height', `${this.config.ggbApplet.height}px`)
    let ggb = document.createElement('div')
    ggb.classList.add('widget-box')
    ggb.id = this.ggbId

    parent.append(ggb)
  }

  buildPlayback() {
    const menuDivElement = document.createElement('div')
    menuDivElement.classList.add('drawing-playback-container')

    const ControlDivElement = document.createElement('div')
    ControlDivElement.classList.add('drawing-playback-container')

    //navigating between answers (states)
    const actions = [
      {
        name: '',
        handler: () => {
          let toggle = false
          let { action, index } = this.state.forward()
          if (index == this.answer.length - 1) toggle = true
          if (index == 0) this.eventHandlers.CLEAR_ANIMATIONS()
          this.eventHandlers[action](index)
          return toggle
        },
        icon: 'mdi-skip-next',
        reset_icon: 'mdi-skip-backward'
      }
    ]
    for (let tool of actions) {
      let div = document.createElement('div')
      div.classList.add('playback-tool')
      // div.style.backgroundColor = '#000'
      let i = document.createElement('i')
      i.classList.add('mdi', tool.icon)
      div.append(i)
      ControlDivElement.append(div)
      div.addEventListener('click', () => {
        let toggle = tool.handler()
        if (toggle) {
          i.classList.remove(tool.icon)
          i.classList.add(tool.reset_icon)
        } else if (i.classList.contains(tool.reset_icon)) {
          i.classList.remove(tool.reset_icon)
          i.classList.add(tool.icon)
        }
      })
    }
    const divEl = document.getElementById(this.divElementId)
    menuDivElement.append(ControlDivElement)
    divEl.appendChild(menuDivElement)
  }

  runscript() {
    this.applet = new GGBApplet(this.config.ggbApplet, '5.0', this.ggbId)
    this.applet.setPreviewImage(
      'data:image/gif;base64,R0lGODlhAQABAAAAADs=',
      'https://www.geogebra.org/images/GeoGebra_loading.png',
      'https://www.geogebra.org/images/applet_play.png'
    )
    this.applet.inject(this.ggbId)
  }
}

var ggbWidget = {
  scripts: ['https://cdn.geogebra.org/apps/deployggb.js'],
  links: [],
  widgetClass: GgbWidget,
  contributesAnswer: true,
  jsonSchema: {
    title: 'GoeGebra widget',
    description: 'Geogebra',
    type: 'object',
    properties: {
      ggbApplet: {
        type: 'object',
        title: 'GGBApplet'
      },
      vars: {
        type: 'array',
        title: 'Variables',
        description: 'Variables for feedback checking'
      },
      feedback: {
        type: 'object',
        properties: {
          parameters: {
            type: 'object',
            title: 'Parameters',
            description: 'Parameters for feedback module'
          },
          default: {
            type: 'string',
            title: 'defaultFB',
            description: 'fallback feedback if no condition is true'
          },
          feedbacks: {
            type: 'array',
            title: 'feedbacks',
            description: 'Array of arrays for feedback (1-1 correspondance with conditions)'
          },
          conditions: {
            type: 'array',
            title: 'conditions',
            description:
              'Array of conditions to check which feedback to give (1-1 correspondance with feedbacks)'
          }
        }
      }
    }
  },

  // prettier-ignore
  jsonSchemaData: {
		"ggbApplet": {},
		"vars": []
	},
  // prettier-ignore
  configStructure: {
		"ggbApplet": {
      "ggbBase64":"XXX"
    }, // see https://wiki.geogebra.org/en/Reference:GeoGebra_App_Parameters
		"vars": [
      {
        "name": "Name of geogebra object",
        "type": "numeric | point | line | segment | polygon | ..."
    }
    ]
	}
}

function _debounced(delay, fn) {
  let timerId
  return function(...args) {
    if (timerId) {
      clearTimeout(timerId)
    }
    timerId = setTimeout(() => {
      fn(...args)
      timerId = null
    }, delay)
  }
}
