export default class GgbPlaybackWidget {
  //class GgbPlaybackWidget {
  constructor(divElementId, config, answer = null, onAnswer, options) {
    this.divElementId = divElementId

    this.eventHandlers = {
      ADD: arg => this.draw_ggb(arg),
      UPDATE: arg => this.draw_ggb(arg),
      CLEAR_ANIMATIONS: () => this.clearAnimations(),
      RESET: () => this.api.reset(),
      UNDO: arg => this.undo_action(arg)
    }

    this.ggbId = `${this.divElementId}GGBcontainer`
    // default values
    let parameters = {
      id: divElementId,
      width:
        document.getElementById(divElementId).clientWidth < 800 ? 600 : 800,
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
      language: "nb"

      // showLogging: 'true' //only for testing/debugging
    }

    // overwrite default values with values passed down from config
    // this.config.parameters = { ...parameters, ...config.ggbApplet }
    this.config = {
      ggbApplet: { ...parameters, ...config.ggbApplet },
      feedback: config.feedback || null,
      vars: config.vars || []
    }

    /* this.config = {
        ...default_config,
        ...config
      } */

    this.vars = {}
    this.answer = answer || { log: [], states: [] }
    if (this.answer.log !== undefined) this.answer = this.answer.log

    this.onAnswer = onAnswer

    if (options.playback) {
      this.playback = options.playback
    }

    this.divContainer = document.getElementById("widget-container")

    this.buildDOM()
    this.config.ggbApplet.appletOnLoad = this.appletOnLoad

    if (!this.playback) {
      this.setAns()
    } else {
      this.answer = edit_log(answer)
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

  show_action_msg(ev) {
    let msgDiv
    msgDiv = document.getElementById("msgdiv")
    if (msgDiv != undefined) {
      msgDiv.remove()
    }

    msgDiv = document.createElement("div")
    msgDiv.id = "msgdiv"
    msgDiv.classList.add("drawing-playback-container")
    msgDiv.style = "float: left"
    this.divContainer.prepend(msgDiv)

    let span = document.createElement("span")
    span.style = "color: red; font-weight: bold;"
    msgDiv.append(span)
    let msgTxt = document.createTextNode(
      "Action: " + ev.action + " object " + ev.objectName
    )
    span.append(msgTxt)
  }

  undo_action(arg) {
    let logg = this.answer[arg]
    this.show_action_msg(logg)
    this.api.undo()
  }

  draw_ggb(arg) {
    const event = this.answer[arg]
    this.show_action_msg(event)
    console.log("CURRENT DATA POINT:", event)
    let cmd = `${event.objectName}=`,
      defStr
    switch (event.objectType) {
      case "point":
        const coords = event.data
        const numOfPoints = typeof event.data.x === "object"
        let [x, y] = numOfPoints
          ? [coords.x[coords.x.length - 1], coords.y[coords.y.length - 1]]
          : [coords.x, coords.y]
        cmd += `(${x},${y})`
        break
      case "line":
        console.log("ADD LINE")
        defStr = event.data.definitionString.split(" ")
        const [type, objs] = [defStr[0], defStr.slice(1).join("")]
        console.log(type, objs)
        switch (type) {
          case "Linje":
            cmd += `Line(${objs})`
            break
          // BUG: There is an issue where the defString returns as "Midtnormal AB", this will be a problem
          // when the arguement "AB" is of the form e.g. "A_2B_4"
          // BUG: Midtnormal for segment mangler
          case "Midtnormal":
            if (objs[0] === objs[0].toUpperCase())
              cmd += `PerpendicularBisector(${objs[0]},${objs[1]})`
            else cmd += `PerpendicularBisector(${objs})`
            break
        }
        break
      case "segment":
        console.log("ADD SEGMENT")
        defStr = event.data.definitionString.split(" ").splice(1)
        cmd += `Segment(${defStr[0][0]},${defStr[1][0]})`
        break
    }
    console.log("EVAL:", cmd)
    this.api.evalCommand(cmd)
    this.api.setUndoPoint()
  }

  clearAnimations() {
    this.api.reset()
    //this.api.newConstruction()
  }

  addUpdateListener = (api, name, type, vars = false, aux = false) => {
    const appendVar = (objName = name) => {
      let value = api.getValue(objName)
      if (!isNaN(value) && value !== null) {
        this.vars[name] = value
      }
      if (type == "point") {
        let x = api.getXcoord(objName),
          y = api.getYcoord(objName)

        this.vars[name + "x"] = x
        this.vars[name + "y"] = y
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
   * Logs action to the answer array
   */

  logger = (api, objName = null, action = "UPDATE") => {
    //if (this.answer.log !== undefined) this.answer = this.answer.log

    let log = {
      action: action,
      time: Date.now(),
      deltaTime: this.answer.length
        ? Date.now() - this.answer[this.answer.length - 1].time
        : null
    }
    let type = api.getObjectType(objName)
    if (objName) {
      log.objectName = objName
      log.objectType = type
    }
    if (action === "ADD") this.addUpdateListener(api, objName, type)
    log.command = api.getValueString(objName)
    let data = {}
    let value = api.getValue(objName)
    if (value !== NaN && value !== null) data.value = value
    if (type === "point") {
      data = {
        x: api.getXcoord(objName).toFixed(5),
        y: api.getYcoord(objName).toFixed(5)
      }
    } else if (type === "angle") {
      data.value *= 180 / Math.PI
    }
    let def = api.getDefinitionString(objName)
    if (def !== "") data["definitionString"] = def
    if (Object.keys(data).length > 0) log.data = data
    this.answer.push(log)
    this.setAns()
  }

  appletOnLoad = api => {
    //get A and B line points from answer log
    this.api = api
    if (!this.playback) {
      const addListener = objName => {
        this.logger(api, objName, "ADD")
      }
      api.registerAddListener(addListener)
      const clientListener = evt => {
        // console.log("CLIENTLISTENER:", evt)
        if (evt[0] == "removeMacro") this.logger(api, null, "RESET")
        // else if (evt[0] == "undo") this.logger(api, null, "UNDO")
      }
      api.registerClientListener(clientListener)

      for (let o of this.config.vars) {
        this.addUpdateListener(api, o.name, o.type, true, o.aux)
      }
    }

    //const clearListener = () => {
    //      this.logger(api, null, 'RESET')
    //}
    //api.registerClearListener(clearListener)

    // const clickListener = obj => {
    // 	console.log(obj)
    // }
    // api.registerClickListener(clickListener)
  }

  setAns() {
    this.onAnswer(this.answer)
  }

  buildDOM() {
    if (this.playback) this.buildPlayback()
    // else this.buildMenu()

    let parent = document.getElementById(this.divElementId)
    parent.setAttribute("height", `${this.config.ggbApplet.height}px`)
    let ggb = document.createElement("div")
    ggb.classList.add("widget-box")
    ggb.id = this.ggbId

    parent.append(ggb)
  }

  buildPlayback() {
    const menuDivElement = document.createElement("div")
    menuDivElement.classList.add("drawing-playback-container")

    const ControlDivElement = document.createElement("div")
    ControlDivElement.classList.add("drawing-playback-container")

    //navigating between answers (states)
    const actions = [
      {
        name: "",
        handler: () => {
          let toggle = false
          let { action, index } = this.state.forward()
          if (index == this.answer.length - 1) toggle = true
          if (index == 0) this.eventHandlers.CLEAR_ANIMATIONS()
          this.eventHandlers[action](index)
          return toggle
        },
        icon: "mdi-skip-next",
        reset_icon: "mdi-skip-backward"
      }
    ]

    for (let tool of actions) {
      let div = document.createElement("div")
      div.classList.add("playback-tool")
      // div.style.backgroundColor = '#000'
      let i = document.createElement("i")
      i.classList.add("mdi", tool.icon)
      div.append(i)
      ControlDivElement.append(div)
      div.addEventListener("click", () => {
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
    this.applet = new GGBApplet(this.config.ggbApplet, "5.0", this.ggbId)
    this.applet.setPreviewImage(
      "data:image/gif;base64,R0lGODlhAQABAAAAADs=",
      "https://www.geogebra.org/images/GeoGebra_loading.png",
      "https://www.geogebra.org/images/applet_play.png"
    )
    this.applet.inject(this.ggbId)
  }
}

var ggbPlaybackWidget = {
  scripts: ["https://cdn.geogebra.org/apps/deployggb.js", "./lib/filtrex.js"],
  links: [
    "/widgets/css/ggbwidget.css",
    "https://cdn.materialdesignicons.com/4.7.95/css/materialdesignicons.min.css"
  ],
  widgetClass: GgbPlaybackWidget,
  contributesAnswer: true,
  jsonSchema: {
    title: "GoeGebra widget",
    description: "Geogebra",
    type: "object",
    properties: {
      ggbApplet: {
        type: "object",
        title: "GGBApplet"
      },
      vars: {
        type: "array",
        title: "Variables",
        description: "Variables for feedback checking"
      },
      feedback: {
        type: "object",
        properties: {
          parameters: {
            type: "object",
            title: "Parameters",
            description: "Parameters for feedback module"
          },
          default: {
            type: "string",
            title: "defaultFB",
            description: "fallback feedback if no condition is true"
          },
          feedbacks: {
            type: "array",
            title: "feedbacks",
            description:
              "Array of arrays for feedback (1-1 correspondance with conditions)"
          },
          conditions: {
            type: "array",
            title: "conditions",
            description:
              "Array of conditions to check which feedback to give (1-1 correspondance with feedbacks)"
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

function edit_log(log) {
  let logg = []
  for (const [i, ev] of log.entries()) {
    // Only ADD events need to be checked for undo
    if (ev.action == "ADD") {
      // find index of first event with equal obj_name and is active (i.e. visible on screen)
      let index = logg.findIndex(
        el => el.objectName === ev.objectName && el.active === true
      )
      if (index > -1) {
        // get chunk of array where there are possible undo events missing
        let sliceLength = logg.slice(index).length
        // loop over chunk in reverse to get undo order right
        for (let j = sliceLength; j > 0; j--) {
          let undoEv = logg[index + j - 1]
          // check if event is undoable, i.e. not already an undo event and is visible on screen
          if (undoEv.action !== "UNDO" && undoEv.active == true) {
            // set visibility to false (this action will be undone)
            undoEv.active = false
            // insert undo event in the new log (logg)
            let undo = {
              action: "UNDO",
              msg: `**UNDOING** ${undoEv.action}: ${undoEv.objectName}`,
              objectName: `${undoEv.action}: ${undoEv.objectName}`
            }
            logg.push(undo)
          }
        }
      }
    }
    // insert event in logg
    let evCopy = {
      ...ev
    }
    evCopy.active = true
    logg.push(evCopy)
  }
  return logg
}

// function edit_log(ans) {
//   let i = 0
//   let log_objects = []
//   let already_set_undone = 0
//   //let subtracted_undones = 0

//   for (let log_line of ans) {
//     let idx_repeated_el = -1

//     let found = log_objects.find(element => element == log_line.objectName)
//     if (found === undefined) {
//       //object already exists and this is an ADD action (thus UNDO action has been performed)
//       if (
//         log_line.action == "ADD" ||
//         log_objects.find(element => element == "UNDO")
//       ) {
//         //reverse array to be able to find previous object, eg E
//         let sorted_arr = [...log_objects]
//         sorted_arr.sort((a, b) => (a.time < b.time ? 1 : -1))
//         idx_repeated_el = sorted_arr.findIndex(
//           x => x.objectName === log_line.objectName && x.to_undo === false
//         )
//         //index is from reversed array, turn around to calculate index in normal array
//         if (idx_repeated_el > -1) {
//           idx_repeated_el = sorted_arr.length - idx_repeated_el - 1
//         }
//         already_set_undone = 0
//         if (idx_repeated_el > -1) {
//           for (let xx = idx_repeated_el + 1; xx < i; xx++) {
//             if (log_objects[xx].num_undo != null) {
//               //counting number of unsets already indicated between the repeated object and the previous instance of it
//               already_set_undone += log_objects[xx].num_undo
//             }
//           }

//           let num_repeats
//           if (idx_repeated_el > -1) {
//             num_repeats = i - idx_repeated_el // - how many previous rows to mark as to_undo
//           } else {
//             num_repeats = null
//           }
//           for (let xx = i - num_repeats; xx < i; xx++) {
//             //mark objects as to_undo
//             log_objects[xx].to_undo = true
//           }
//         }
//       }
//     }

//     log_objects.push({
//       data: log_line.data,
//       num_undo:
//         idx_repeated_el > -1 ? i - idx_repeated_el - already_set_undone : null,
//       objectName: log_line.objectName,
//       time: log_line.time,
//       to_undo: false,
//       action: log_line.action, //'UNDO' : log_line.action,
//       deltaTime: log_line.deltaTime,
//       objectType: log_line.objectType
//     })
//     i++
//   }
//   //go through obj array and insert the n number of undo lines in corresponding place
//   if (log_objects.length > 0) {
//     for (let x = 0; x < log_objects.length; x++) {
//       let tp = 0
//       if (log_objects[x].num_undo != null) {
//         tp = x
//         for (let i = 0; i < log_objects[x].num_undo; i++) {
//           if (log_objects[tp - i - 1].to_undo == null) {
//             //this.log_objects[x].num_undo++
//             //i++
//           }
//           let undo_obj = {
//             data: null,
//             num_undo: null,
//             objectName: log_objects[tp - i - 1].objectName,
//             time: null,
//             to_undo: null,
//             action: "UNDO",
//             deltaTime: null,
//             objectType: null
//           }
//           log_objects.splice(x - i, 0, undo_obj)
//           x = x + 1
//         }
//       }
//     }
//   }
//   console.log(log_objects)
//   return log_objects
// }
