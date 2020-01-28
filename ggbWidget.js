export default class GgbWidget {
  // class GgbWidget {
  constructor(divElementId, config, answer = null, onAnswer, options) {
    this.divElementId = divElementId

    this.eventHandlers = {
      CLEAR_DRAWING: () => this._clearDrawing(),
      UNDO: arg => this._undo(),
      ADD: arg => {
        let logg = this.answer[arg]

        if (logg.object_type == 'point') {
          this.api.evalCommand(logg.object_name + '= (' + logg.data.x + ', ' + logg.data.y + ')')
        }

        if (logg.object_type == 'segment') {
          let descr = logg.data.definition_string
          //description values not in log, must fetch objects in string for now
          let p_comma = descr.indexOf(',')
          let b1 = descr.substring(p_comma - 1, p_comma)
          let b2 = descr.substring(p_comma + 2, p_comma + 3)
          this.api.evalCommand(logg.object_name + '= Segment(' + b1 + ',' + b2 + ')')
        }
      },
      UPDATE: arg => {
        let logg = this.answer[arg]
        console.log(logg.action, logg.object_name, logg.data.x, logg.data.y)
        this.api.setCoords(logg.object_name, logg.data.x, logg.data.y)
      },
      PEN: arg => {
        this.paper.activate()
        console.log('PEN', arg)
        const data = this.answer.log[arg].data
        console.log('DATA X:', data)
        const path = new this.paper.Path({
          strokeCap: 'round',
          strokeJoin: 'round',
          strokeWidth: data.strokeWidth,
          strokeColor: data.color
        })
        for (let i = 0, len = data.x.length; i < len; i++) {
          path.add(new this.paper.Point(data.x[i], data.y[i]))
        }
        path.smooth()
        this._paperPaths.push(path)
      }
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
        //next: this.ans.log[0].action,
        //next: this.answer.log[0].action,

        current: 0,
        forward: () => {
          let action = this.state.next,
            index = this.state.current
          this.state.current = (this.state.current + 1) % this.answer.length
          //this.state.current = (this.state.current + 1) % this.ans.log.length
          //this.state.current = (this.state.current + 1) % this.answer.log.length
          this.state.next = this.answer[this.state.current].action
          //this.state.next = this.ans.log[this.state.current].action
          //this.state.next = this.answer.log[this.state.current].action

          return { action: action, index: index }
        }
      }
      let vf = 4
    }
    window.onload = this.runscript()
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
      if (!aux) this.logger(api, name)
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
    //this.api.evalCommand('Line(A,B)')
    //this.api.getXcoord('A')
    //this.api.setCoords('A', 9, 9)

    const addListener = objName => {
      s
      this.logger(api, objName, 'ADD')
    }
    api.registerAddListener(addListener)

    const clearListener = () => {
      this.logger(api, null, 'RESET')
    }
    api.registerClearListener(clearListener)

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
    this.onAnswer(this.answer.log)
  }

  /* setAns2() {
    this.paper.activate()
    console.log('loading answer')
    // render paths
    if (this.answer.paperJSON && this.answer.paperJSON.length) {
      for (let path of this.answer.paperJSON) {
        let newPath = new this.paper.Path()
        newPath.importJSON(path)
        this._paperPaths.push(newPath)
      }
    }
  } */

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
          //if (index == 0) this.eventHandlers.CLEAR_DRAWING()
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

  // buildMenu() {
  //   let divElement = document.getElementById(this.divElementId)

  //   let menuDivElement = document.createElement('div')
  //   menuDivElement.classList.add('drawing-menu-container')

  //   let ColorDivElement = document.createElement('div')
  //   ColorDivElement.classList.add('drawing-group-container')

  //   let StrokeDivElement = document.createElement('div')
  //   StrokeDivElement.classList.add('drawing-group-container')

  //   let ToolDivElement = document.createElement('div')
  //   ToolDivElement.classList.add('drawing-group-container')

  //   let ControlDivElement = document.createElement('div')
  //   ControlDivElement.classList.add('drawing-group-container')
  // }

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
