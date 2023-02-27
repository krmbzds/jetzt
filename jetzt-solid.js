/*! jetzt 2023-02-27
* https://krmbzds.github.io/jetzt/
* Copyright (c) 2023 David Sheldrick and contributors; Licensed Apache 2.0 */
(function (window) {
  
  if (typeof window.jetzt !== 'undefined') {
    console.warn("jetzt unable to initialize, window.jetzt already set");
    return;
  } else {
    window.jetzt = {};
  }

})(this);
(function (window) {

  var jetzt = window.jetzt;
  var H = {};

  jetzt.helpers = H;

  H.removeFromArray = function (arr, item) {
    var pos = arr.indexOf(item);
    if (pos > -1) arr.splice(pos, 1);
  };

  // TODO: Move dom specific stuff into separate helpers module for testing
  //       purposes
  H.getScrollTop = function () {
    return document.body.scrollTop || document.documentElement.scrollTop;
  };

  H.getScrollLeft = function () {
    return document.body.scrollLeft || document.documentElement.scrollLeft;
  };


  // make an element of the specified tag and class
  H.elem = function (tagName, className, kids) {
    var result = document.createElement(tagName);
    result.className = className || "";
    if (kids) {
      kids.forEach(function (kid) {result.appendChild(kid);})
    }
    return result;
  };

  H.div = function (className, kids) {
    return H.elem('div', className, kids);
  };

  H.span = function (className, kids) {
    return H.elem('span', className, kids);
  };

  function _modClass (elem, classes, cb) {
    var elemClasses = [];
    if (elem.className.trim().length >= 0) {
      elemClasses = elem.className.split(/\s+/)
    }

    classes.split(/\s+/).forEach(function (klass) {
      cb(elemClasses, klass);
    });

    elem.className = elemClasses.join(" ");
  }

  H.addClass = function (elem, classesToAdd) {
    _modClass(elem, classesToAdd, function (acc, klass) {
      H.removeFromArray(acc, klass);
      acc.push(klass);
    });
  };

  H.removeClass = function (elem, classesToRemove) {
    _modClass(elem, classesToRemove, H.removeFromArray);
  };

  H.hasClass = function (elem, classesToFind) {
    var found = true;
    _modClass(elem, classesToFind, function (elemClassses, klass) {
      found = found && elemClassses.indexOf(klass) > -1;
    });
    return found;
  };

  H.realTypeOf = function (thing) {
    return Object.prototype.toString.call(thing).slice(8, -1);
  };

  // flatten possibly nested array
  H.flatten = function (arr) {
    var result = [];
    var flat = function flat (thing) {
      if (Object.prototype.toString.call(thing) === '[object Array]')
        thing.forEach(flat);
      else
        result.push(thing);
    };
    flat(arr);
    return result;
  };

  H.clamp = function (min, num, max) {
    return Math.min(Math.max(num, min), max);
  };

  // merge objects together and so forth. don't rely on child object
  // references being preserved.
  H.recursiveExtend = function () {
    var result = arguments[0];
    for (var i=1; i<arguments.length; i++) {
      var uber = arguments[i];
      for (var prop in uber) {
        if (uber.hasOwnProperty(prop)) {
          if (result.hasOwnProperty(prop)) {
            var resultVal = result[prop];
            var uberVal = uber[prop];
            if (H.realTypeOf(resultVal) === 'Object'
                 && H.realTypeOf(uberVal) === 'Object') {
              result[prop] = H.recursiveExtend({}, resultVal, uberVal);
            } else {
              result[prop] = uberVal;
            }
          } else {
            result[prop] = uber[prop];
          }
        }
      }
    }
    return result;
  };

  H.keys = function (obj) {
    var result = [];
    for (var prop in obj) { if (obj.hasOwnProperty(prop)) result.push(prop); }
    return result;
  };

  H.clone = function (obj) {
    return JSON.parse(JSON.stringify(obj));
  }

})(this);



(function (window) {

  var jetzt = window.jetzt
    , H = jetzt.helpers;

  // if you add any properties to themes, make sure to bump this
  var CONFIG_VERSION = 0;

  var DEFAULT_THEMES = [
    {
      "name": "Classic",
      "dark": {
        "backdrop_opacity": "0.86",
        "colors": {
          "backdrop": "#000000",
          "background": "#303030",
          "foreground": "#E0E0E0",
          "message": "#909090",
          "pivot": "#73b5ee",
          "progress_bar_background": "#000000",
          "progress_bar_foreground": "#3a5566",
          "reticle": "#656565",
          "wrap_background": "#404040",
          "wrap_foreground": "#a1a1a1"
        }
      },
      "light": {
        "backdrop_opacity": "0.07",
        "colors": {
          "backdrop": "black",
          "background": "#fbfbfb",
          "foreground": "#333333",
          "message": "#929292",
          "pivot": "#E01000",
          "progress_bar_background": "black",
          "progress_bar_foreground": "#00c00a",
          "reticle": "#efefef",
          "wrap_background": "#f1f1f1",
          "wrap_foreground": "#666"
        }
      }
    }
    // put more themes here
  ];

  var DEFAULT_MODIFIERS = {
    normal: 1,
    start_clause: 1,
    end_clause: 1.8,
    start_sentence: 1.3,
    end_sentence: 2.2,
    start_paragraph: 2.0,
    end_paragraph: 2.8,
    short_space: 1.5,
    long_space: 2.2
  }

  // Don't commit changes to these without prior approval please
  var DEFAULT_OPTIONS = {
    // if we change config structure in future versions, having this means
    // we can update users' persisted configs to match.
    config_version: CONFIG_VERSION,
    target_wpm: 500,
    scale: 1,
    dark: true,
    selected_theme: 1,
    show_message: false,
    strip_citation: false,
    selection_color: "#FF0000",
    modifiers: DEFAULT_MODIFIERS,
    font_family: "Menlo, Monaco, Consolas, monospace",
    font_weight: "normal",
    custom_themes: []
  };


  /*** STATE ***/

  // This is where we store the options for the current instance of jetzt.
  // The identity of the object never changes.
  var options = H.clone(DEFAULT_OPTIONS);

  // list of folks to notify of changes
  var listeners = [];

  function announce () {
    listeners.forEach(function (cb) { cb(); });
  }

  // recursive lookup. Like clojure's get-in;
  function lookup (map, keyPath) {
    if (keyPath.length === 0) throw new Error("No keys specified.");

    var key = keyPath[0];
    if (keyPath.length === 1) {
      if (!map.hasOwnProperty(key)) {
        console.warn("config lookup: no key '"+key+"'");
      }
      return map[key];
    } else {
      var submap = map[key];
      if (H.realTypeOf(submap) !== 'Object') {
        console.warn("config lookup: no key '"+key+"'");
        return;
      } else {
        return lookup(submap, keyPath.slice(1));
      }
    }
  }

  // recursive put. Like clojure's assoc-in
  function put (map, keyPath, val) {
    if (keyPath.length === 0) throw new Error("No keys specified.");

    var key = keyPath[0];
    if (keyPath.length === 1) {
      map[key] = val;
    } else {
      var submap = map[key];
      if (H.realTypeOf(submap) !== 'Object') {
        submap = {};
        map[key] = submap;
      }
      _put(submap, keyPath.slice(1), val);
    }
  }

  /*** BACKEND ***/

  // the backend is a swappable object with two methods, get and set. 
  // get takes a cb and should invoke the callback, supplying the persisted
  // JSON if available, or some falsey value if not. Set takes some json and
  // presumably puts it somewhere. Or not. whatevs.

  // It is initialised with a localStorage placeholder for the bookmarklet and
  // demo page.
  var KEY = "jetzt_options";

  var configBackend = {
    get: function (cb) {
      var json = localStorage.getItem(KEY);
      if(json) {
        cb("{}");
      } else {
        cb(json);
      }
    },
    set: function (json) {
      localStorage.setItem(KEY, json);
    }
  };

  /*** (DE)SERIALISATION ***/

  function persist () {
    configBackend.set(JSON.stringify(options));
  }

  function unpersist (json) {
    try {
      var opts = JSON.parse(json || "{}")
        , repersist = false;

      if (opts.config_version != CONFIG_VERSION) {

        // update custom themes
        if (opts.custom_themes) {
          H.keys(opts.custom_themes).forEach(function (id) {
            var customTheme = opts.custom_themes[id];
            opts.custom_themes[id] =
                    H.recursiveExtend(DEFAULT_THEMES.Classic, customTheme);
          });
        }

        opts.config_version = CONFIG_VERSION;
        repersist = true;
      }

      H.recursiveExtend(options, opts);

      window.jazz = options;

      repersist && persist();
      announce();
    } catch (e) {
      throw new Error("corrupt config json", e);
    }
  }


  /**
   * jetzt.config
   * get and set config variables.
   *
   * e.g.
   *      jetzt.config("cheese", "Edam")
   * 
   * sets the "cheese" option to the string "Edam"
   *
   *      jetzt.config("cheese")
   *
   *      => "edam"
   *
   * It also has support for key paths
   *
   *      jetzt.config(["cheese", "color"], "blue")
   *      jetzt.config(["cheese", "name"], "Stilton")
   *
   *      jetzt.config(["cheese", "name"])
   *
   *      => "Stilton"
   *
   *      jetzt.config("cheese")
   * 
   *      => {color: "blue", name: "Stilton"}
   */
  var config = function (keyPath, val) {
    if (typeof keyPath === 'string') keyPath = [keyPath];

    if (arguments.length === 1) {
      return lookup(options, keyPath);
    } else {
      put(options, keyPath, val);
      persist();
      announce();
    }
  };

  jetzt.config = config;

  config.DEFAULTS = H.clone(DEFAULT_OPTIONS);
  config.DEFAULT_THEMES = H.clone(DEFAULT_THEMES);

  /**
   * takes a callback and invokes it each time an option changes
   * returns a function which, when invoked, unregisters the callback
   */
  config.onChange = function (cb) {
    listeners.push(cb);
    return function () { H.removeFromArray(listeners, cb); };
  };

  /**
   * Set the config 'backend' store. Should be an object with methods
   * void get(cb(opts))
   * void set(opts)
   */
  config.setBackend = function (backend) {
    configBackend = backend;
    this.refresh();
    announce();
  };

  /**
   * Triggers an automatic reload of the persisted options
   */
  config.refresh = function (cb) {
    configBackend.get(function (json) {
      unpersist(json);
      cb && cb();
    });
  };

  config.getSelectedTheme = function () {
    return DEFAULT_THEMES[options.selected_theme] || DEFAULT_THEMES[0];
  };

  /**
   * convenience function for finding the highest of two modifiers.
   */
  config.maxModifier = function (a, b) {
    return this(["modifiers", a]) > this(["modifiers", b]) ? a : b;
  };

  config.adjustWPM = function (diff) {
    options.target_wpm = H.clamp(100, options.target_wpm + diff, 1500);
    announce();
    persist();
  };

  config.adjustScale = function (diff) {
    this("scale", H.clamp(0, options.scale + diff, 1));
  };


  /**
   * might be neccessary to trigger a save manually
   */
  config.save = function () {
    persist();
  };

  // load the options from the default config backend to get the ball rolling
  config.refresh();

})(this);

(function (window) {

  var jetzt = window.jetzt;
  var H = jetzt.helpers;
  var config = jetzt.config;


  // splitting long words. Used by the Instructionator.

  function wordShouldBeSplitUp(word) {
    return word.length > 13 || word.length > 9 && word.indexOf("-") > -1;
  }

  // split a long word into sensible sections
  function splitLongWord (word) {
    if (wordShouldBeSplitUp(word)) {
      var result = [];

      var dashIdx = word.indexOf("-");
      if (dashIdx > 0 && dashIdx < word.length - 1) {
        result.push(word.substr(0, dashIdx));
        result.push(word.substr(dashIdx + 1));
        return H.flatten(result.map(splitLongWord));
      } else {
        var partitions = Math.ceil(word.length / 8);
        var partitionLength = Math.ceil(word.length / partitions);
        while (partitions--) {
          result.push(word.substr(0, partitionLength));
          word = word.substr(partitionLength);
        }
        return result;
      }
    } else {
      return [word];
    }
  }

  // regexp that matches in-text citations
  var _reInTextCitation = (function () {
    var au = "((\\S\\.\\s)?(\\S+\\s)?\\S+?)";          // author
    var et = "(,?\\set\\sal\\.?)";                     // et al.

    var yr = "((16|17|18|19|20)\\d{2}[a-z]?)";         // year restricted in 17c.-21c.
    var pt = "([a-z]{1,4}\\.\\s\\d+)";                 // part: p. 199, chap. 5, etc.
    var yp = "(" + yr + "|" + pt + ")";                // year and part
    var pp = "(" + pt + "|\\d+)";                      // part and page

    var as = "((" + au + ",\\s)*" + au +
             ",?\\s(and|&)\\s)?" + au + et;            // multiple authors
    var ml = as + "?\\s\\d+(,\\s\\d+)*";               // MLA author-page (disabled)
    var ap = "(" + as + "?,?\\s)?" + yp +
             "((,\\s|:)" + pp + ")*";                  // APA/CMS/ASA author-year-page

    var hs = "(" + as + "|" + ap + ")";                // humanist single citation
    var hm = "\\((" + hs + "(;|,|,?\\s(and|&))\\s)*" +
             hs + "\\)";                               // humanist multiple citations
    var ie = "\\[\\d+\\]";                             // IEEE

    return new RegExp("\\s?(" + hm + "|" + ie + ")", "g");
  })();

  function stripInTextCitation (text) {
    return text.replace(_reInTextCitation, "");
  }

  /**
   * Helper class for generating jetzt instructions.
   * Very subject to change.
   */
  function Instructionator () {
    // state
    var instructions = []
      , modifier = "normal"
      , wraps = []
      , spacerInstruction = null
      , done = false;

    // add a modifier to the next token
    this.modNext = function (mod) {
      modifier = config.maxModifier(modifier, mod);
    };

    // add a modifier to the previous token
    this.modPrev = function (mod) {
      if (instructions.length > 0) {
        var current = instructions[instructions.length-1].modifier;
        instructions[instructions.length-1].modifier = config.maxModifier(current, mod);
      }
    };

    // add a decorator to the previous token
    this.decPrev = function (dec) {
      if (instructions.length > 0) {
        var current = instructions[instructions.length-1].decorator;
        instructions[instructions.length-1].decorator += dec;
      }
    };

    // start a wrap on the next token
    this.pushWrap = function (wrap) {
      wraps.push(wrap);
    };

    // stop the specified wrap before the next token.
    // Pops off any wraps in the way
    this.popWrap = function (wrap) {
      var idx = wraps.lastIndexOf(wrap);
      if (idx > -1)
        wraps.splice(wraps.lastIndexOf(wrap), wraps.length);
    };

    // pop all wraps
    this.clearWrap = function (wrap) {
      wraps = [];
    };

    var _addWraps = function (instr) {
      instr.leftWrap = wraps.map(function (w) { return w.left; }).join("");
      instr.rightWrap = wraps.map(function (w) { return w.right; }).reverse().join("");
      return instr;
    }

    // put a spacer before the next token
    this.spacer = function () {
      if (spacerInstruction) {
        spacerInstruction.modifier = "long_space";
      } else {
        spacerInstruction = _addWraps({
          token: "   ",
          modifier: "short_space",
          decorator: ""
        });
      }
    };

    // add the token
    this.token = function (token) {
      if (spacerInstruction) {
        instructions.push(spacerInstruction);
      }

      var trunks = wordShouldBeSplitUp(token) ? splitLongWord(token) : [token]
        , last = trunks.pop();
      trunks.forEach(function (t) {
        instructions.push(_addWraps({
          token: t,
          modifier: "normal",
          decorator: "-"
        }));
      });
      instructions.push(_addWraps({
        token: last,
        modifier: modifier,
        decorator: ""
      }));

      modifier = "normal";
      spacerInstruction = null;
    };

    this.getInstructions = function () {
      return instructions;
    };
  }

  var wraps = {
    guillemot: {left: "«", right: "»"},
    double_quote: {left: "“", right: "”"},
    parens: {left: "(", right: ")"},
    heading: {left: "#", right: ""},
    blockquote: {left: "›", right: ""}  // U+203A
  };

  function parseDom(topnode,$instructionator) {
    var inst =  ($instructionator) ? $instructionator :  new Instructionator();

    var nodes = null;
    if (H.realTypeOf(topnode) === "Array") {
      nodes = topnode;
    } else {
      nodes = topnode.childNodes;

      var all_inline = [].reduce.call(
        nodes,
        function(val, node) {
          return val && (node.nodeType !== 1 ||
            !!window.getComputedStyle(node).display.match(/^inline/));
        },
        true
      );
      if (all_inline) {
        var text = topnode.textContent.trim();
        if (text.length > 0) parseText(text, inst);
        return inst.getInstructions();
      }
    }

    var node=null;
    for(var i=0;i<nodes.length;i++) {
        node = nodes[i];

        //TODO add modifiers, e.g. based on node.nodeName
        switch(node.nodeName) {
          case "H1":
          case "H2":
          case "H3":
          case "H4":
          case "H5":
          case "H6":
            inst.clearWrap();
            inst.pushWrap(wraps.heading);
            inst.modNext("start_paragraph");
            parseDom(node,inst);
            inst.spacer();
            inst.popWrap(wraps.heading);
            inst.modPrev("end_paragraph");
            break;
          case "BLOCKQUOTE":
            inst.pushWrap(wraps.blockquote);
            inst.modNext("start_paragraph");
            parseDom(node,inst);
            inst.popWrap(wraps.blockquote);
            inst.modPrev("end_paragraph");
            break;
          case "SCRIPT":
            break;
          case "#text":
            if(node.textContent.trim().length > 0) parseText(node.textContent.trim(),inst);
            break;
          case "DL":
          case "OL":
          case "UL":
          case "SECTION":
          case "P":
            inst.modNext("start_paragraph");
            parseDom(node, inst)
            inst.modPrev("end_paragraph");
            break;
          case "#comment":
            break;
          default:
            parseDom(node,inst);
        }
    }

    return inst.getInstructions();
  }

  // convert raw text into instructions
  function parseText (text,$instructionator) {
    if (config("strip_citation")) text = stripInTextCitation(text);
                        // long dashes ↓
    var tokens = text.match(/["«»“”\(\)\/–—]|--+|\n+|[^\s"“«»”\(\)\/–—]+/g);
    if (tokens === null) tokens = [];

    var $ = ($instructionator) ? $instructionator :  new Instructionator();

    // doesn't handle nested double quotes, but that junk is *rare*;
    var double_quote_state = false;

    for (var i=0; i<tokens.length; i++) {
      var tkn = tokens[i];

      switch (tkn) {
        case "“":
          $.spacer();
          $.pushWrap(wraps.double_quote);
          $.modNext("start_clause");
          break;
        case "”":
          $.popWrap(wraps.double_quote);
          $.modPrev("end_clause");
          $.spacer();
          break;
        case "«":
          $.spacer();
          $.pushWrap(wraps.guillemot);
          $.modNext("start_clause");
          break;
        case "»":
          $.popWrap(wraps.guillemot);
          $.modPrev("end_clause");
          $.spacer();
          break;
        case "\"":
          if (double_quote_state) {
            $.popWrap(wraps.double_quote)
            $.spacer();
            $.modNext("start_clause");
          } else {
            $.spacer();
            $.pushWrap(wraps.double_quote);
            $.modPrev("end_clause");
          }
          double_quote_state = !double_quote_state;
          break;
        case "(":
          $.spacer();
          $.pushWrap(wraps.parens);
          $.modNext("start_clause");
          break;
        case ")":
          $.popWrap(wraps.parens);
          $.modPrev("end_clause");
          $.spacer();
          break;
        default:
          if (tkn.match(/^(\/|--+|—|–)$/)) {
            $.modNext("start_clause");
            $.token(tkn);
            $.modNext("start_clause");
          } else if (tkn.match(/^[.?!…]+$/)) {
            $.decPrev(tkn);
            $.modPrev("end_sentence");
          } else if (tkn.match(/[.?!…]+$/)) {
            $.modNext("end_sentence");
            $.token(tkn);
            $.modNext("start_sentence");
          } else if (tkn.match(/^[,;:]$/)) {
            $.decPrev(tkn);
            $.modPrev("end_clause");
          } else if (tkn.match(/[,;:]$/)) {
            $.modNext("end_clause");
            $.token(tkn);
            $.modNext("start_clause");
          } else if (tkn.match(/\n+/)) {
            if (tkn.length > 1
                // hack for linefeed-based word wrapping. Ugly. So ugly.
                || (i > 0 && tokens[i - 1].match(/[.?!…'"”]+$/))) {

              $.clearWrap();
              $.modPrev("end_paragraph");
              $.spacer();
              $.modNext("start_paragraph");
              double_quote_state = false;
            }
          } else if (tkn.match(/^".+$/)) {
            double_quote_state = true;
            $.modNext("start_clause");
            $.token(tkn.substr(1));
          } else {
            $.token(tkn);
          }
      }
    }

    return $.getInstructions();
  }

  function parseStuff (parser, content) {
    var instr = new Instructionator();
    parser(content, instr);

    return instr.getInstructions();
  }

  jetzt.parse = {
    /**
     * Read the given string, or array of strings.
     */
    string: function (str) {
      return parseStuff(parseText, str);
    },

    /**
     * Read the given DOM element, or array of DOM elements.
     */
    dom: function (dom) {
      return parseStuff(parseDom, dom);
    }
  };

})(this);


(function (window) {

  var jetzt  = window.jetzt
    , config = jetzt.config;

  function calculateDelay(instr) {
    var interval = 60 * 1000 / config("target_wpm");
    if (instr.modifier !== "normal") {
      return interval * config(["modifiers", instr.modifier]);
    } else {
      var len = instr.token.length;
      var mul = 1;
      switch (len) {
        case 6:
        case 7:
          mul = 1.2;
          break;
        case 8:
        case 9:
          mul = 1.4;
          break;
        case 10:
        case 11:
          mul = 1.8;
          break;
        case 12:
        case 13:
          mul = 2;
      }
      return interval * mul;
    }
    return interval;
  }

  var startModifiers = {
    "start_sentence": true,
    "start_paragraph": true
  };


  /**
   * Executor takes some instructions and a reader and updates the reader
   * based on the start/stop/naviation methods.
   */
  function Executor (instructions) {
    var reader = jetzt.view.reader;

    /*** STATE ***/
    var running = false // whether or not the reader is running
      , index = 0       // the index of the current instruction
      , runLoop;        // the run loop timeout

    function updateReader (instr) {
      if (typeof instr === "undefined") {
        if (index < instructions.length) {
          instr = instructions[index];
        } else {
          instr = instructions[instructions.length - 1];
        }
      }
      reader.setWord(instr.token, instr.decorator);
      reader.setWrap(instr.leftWrap, instr.rightWrap);
      reader.setProgress(100 * (index / instructions.length));

      if (index === 1) {
        startedReading();
      } else if (index === instructions.length) {
        finishedReading();
      } else if (index % 5 === 0) {
        calculateRemaining();
      }
    }

    /**
     * Calculate and display the time remaining
     */
    function calculateRemaining () {
      var words = instructions.length;
      var timestamp = Math.round(new Date().getTime() / 1000);
      var elapsed = timestamp - reader.started;
      var remaining = (elapsed * (words - index)) / index;
      reader.setMessage(Math.round(remaining) + "s left");
    }

    
    function startedReading () {
      var timestamp = Math.round(new Date().getTime() / 1000);
      reader.started = timestamp;
    }
    
    function finishedReading () {
      var words = instructions.length;
      var timestamp = Math.round(new Date().getTime() / 1000);
      var elapsed = timestamp - reader.started;
      reader.setMessage(words + " words in " + elapsed + "s");
    }

    function handleInstruction (instr) {
      updateReader(instr);
      defer(calculateDelay(instr));
    }

    function defer (time) {
      runLoop = setTimeout(function (){
        if (running && index < instructions.length) {
          handleInstruction(instructions[index++]);
        } else {
          running = false;
        }
      }, time);
    }

    /**
     * Start executing instructions
     */
    this.start = function () {
      if (index === instructions.length) {
        index = 0;
      }
      running = true;
      defer(0);
    };

    /**
     * Stop executing instructions
     */
    this.stop = function () {
      clearTimeout(runLoop);
      running = false;
    };

    /**
     * start and stop the reader
     */
    this.toggleRunning = function (run) {
      if (run === running) return;

      running ? this.stop() : this.start();
    };
    
    /**
     * Navigate to the start of the sentence, or the start of the previous
     * sentence, if less than 5 words into current sentence.
     */
    this.prevSentence = function () {
      index = Math.max(0, index - 5);
      while (index > 0 && !startModifiers[instructions[index].modifier]) {
        index--;
      }
      if (!running) updateReader();
    };

    /**
     * Navigate to the start of the next sentence.
     */
    this.nextSentence = function () {
      index = Math.min(index+1, instructions.length - 1);
      while (index < instructions.length - 1
               && !startModifiers[instructions[index].modifier]) {
        index++;
      }
      if (!running) updateReader();
    };

    /**
     * Navigate to the start of the paragraph, or the start of the previous
     * paragraph, if less than 5 words into current paragraph
     */
    this.prevParagraph = function () {
      index = Math.max(0, index - 5);
      while (index > 0 && instructions[index].modifier != "start_paragraph") {
        index--;
      }
      if (!running) updateReader();
    };

    /**
     * Navigate to the start of the next paragraph.
     */
    this.nextParagraph = function () {
      index = Math.min(index+1, instructions.length - 1);
      while (index < instructions.length - 1
              && instructions[index].modifier != "start_paragraph") {
        index++;
      }
      if (!running) updateReader();
    };
  }


  /**
   * jetzt.exec
   * creates an instruction execution interface for a given set of
   * instructions
   */
  jetzt.exec = function (instructions) {
    return new Executor(instructions);
  };

})(this);

(function (window) {

  var jetzt = window.jetzt
    , config = jetzt.config
    , H = jetzt.helpers
    , div = H.div
    , span = H.span
    , view = {};

  jetzt.view = view;

  // calculate the focal character index
  function calculatePivot (word) {
    var l = word.length;
    if (l < 2) {
      return 0;
    } else if (l < 6) {
      return 1;
    } else if (l < 10) {
      return 2;
    } else if (l < 14) {
      return 3;
    } else {
      return 4;
    }
  }


  function Reader () {
    // elements
    var backdrop = div("sr-backdrop")
      , wpm = div("sr-wpm")
      , leftWrap = div("sr-wrap sr-left")
      , rightWrap = div("sr-wrap sr-right")
      , leftWord = span()
      , rightWord = span()
      , pivotChar = span("sr-pivot")
      , decorator = span("sr-decorator")
      , word = div("sr-word", [leftWord, pivotChar, rightWord, decorator])

      , progressBar = div("sr-progress")
      , message = div("sr-message")
      , reticle = div("sr-reticle")
      , wordBox = div("sr-word-box", [
          reticle, progressBar, message, word, wpm
        ])
      , box = div("sr-reader", [
          leftWrap,
          wordBox,
          rightWrap
        ])

      , wrapper = div("sr-reader-wrapper", [box])

      , unlisten;

    box.onkeyup = box.onkeypress = function (ev) {
      if(!ev.ctrlKey && !ev.metaKey) {
        ev.stopImmediatePropagation();
        return false;
      }
    };


    var grabFocus = function () {
    	box.tabIndex = 0; // make sure this element can have focus
    	box.focus();
    };

    this.onBackdropClick = function (cb) {
      backdrop.onclick = cb;
    };

    this.onKeyDown = function (cb) {
    	box.onkeydown = cb;
    };

    this.dark = false;

    this.applyConfig = function () {
      // initialise custom size/wpm
      this.dark = config("dark");

      this.applyTheme(config.getSelectedTheme());

      this.setScale(config("scale"));
      this.setWPM(config("target_wpm"));
      this.setFont(config("font_family"));
      this.setFontWeight(config("font_weight"));

      if (config("show_message")) {
        this.showMessage();
      } else {
        this.hideMessage();
      }
    };

    this.appendTo = function (elem) {
      // fade in backdrop
      elem.appendChild(backdrop);

      // pull down box;
      elem.appendChild(wrapper);
      wrapper.offsetWidth;
      H.addClass(wrapper, "in");
    };

    this.watchConfig = function () {
      var that = this;
      unlisten = config.onChange(function () { that.applyConfig(); });
    };

    this.unwatchConfig = function () {
      unlisten && unlisten();
    };

    this.show = function (cb) {
      this.appendTo(document.body);

      // apply and listen to config;
      this.applyConfig();
      this.watchConfig();

      // need to stop the input focus from scrolling the page up.
      var scrollTop = H.getScrollTop();
      grabFocus();
      document.body.scrollTop = scrollTop;
      document.documentElement.scrollTop = scrollTop;

      box.onblur = grabFocus;
      window.onfocus = function() {
        setTimeout(grabFocus, 100);
      }

      typeof cb === 'function' && window.setTimeout(cb, 340);
    };


    this.hide = function (cb) {
      unlisten();
      box.onblur = null;
      box.blur();
      backdrop.style.opacity = 0;
      H.removeClass(wrapper, "in");
      window.setTimeout(function () {
        backdrop.remove();
        wrapper.remove();
        typeof cb === 'function' && cb();
      }, 340);
    };

    this.setScale = function (scale) {
      wrapper.style.webkitTransform = "translate(-50%, -50%) scale("+scale+")";
      wrapper.style.mozTransform = "translate(-50%, -50%) scale("+scale+")";
      wrapper.style.transform = "translate(-50%, -50%) scale("+scale+")";
    };

    this.setWPM = function (target_wpm) {
      wpm.innerHTML = target_wpm + "";
    };

    this.setFont = function (font) {
      // thanks for pointing that out
      leftWord.style.fontFamily = font;
      pivotChar.style.fontFamily = font;
      rightWord.style.fontFamily = font;
      decorator.style.fontFamily = font;
      leftWrap.style.fontFamily = font;
      rightWrap.style.fontFamily = font;
      wpm.style.fontFamily = font;
      message.style.fontFamily = font;
    };

    this.setFontWeight = function (fontWeight) {
      leftWord.style.fontWeight = fontWeight;
      pivotChar.style.fontWeight = fontWeight;
      rightWord.style.fontWeight = fontWeight;
      decorator.style.fontWeight = fontWeight;
    };

    this.applyTheme = function (theme) {
      var style;
      if (this.dark) {
        style = theme.dark;
      } else {
        style = theme.light;
      }
      var c = style.colors;

      backdrop.offsetWidth;
      backdrop.style.opacity = style.backdrop_opacity;

      backdrop.style.backgroundColor = c.backdrop;
      wordBox.style.backgroundColor = c.background;
      leftWord.style.color = c.foreground;
      rightWord.style.color = c.foreground;
      leftWrap.style.backgroundColor = c.wrap_background;
      rightWrap.style.backgroundColor = c.wrap_background;
      leftWrap.style.color = c.wrap_foreground;
      rightWrap.style.color = c.wrap_foreground;
      reticle.style.borderColor = c.reticle;
      pivotChar.style.color = c.pivot;
      decorator.style.color = c.message;
      progressBar.style.borderColor = c.progress_bar_foreground;
      progressBar.style.backgroundColor = c.progress_bar_background;
      message.style.color = c.message;
      wpm.style.color = c.message;
    };


    this.setProgress = function (percent) {
      progressBar.style.borderLeftWidth = Math.ceil(percent * 4) + "px";
    };

    this.setMessage = function (msg) {
     message.innerHTML = msg;
    };

    this.showMessage = function () {
      message.style.display = "block";
    };

    this.hideMessage = function () {
      message.style.display = "none";
    };

    this.started = false;

    this.setWord = function (token, dec) {
      var pivot = calculatePivot(token.replace(/[?.,!:;*-]+$/, ""));
      leftWord.innerHTML = token.substr(0, pivot);
      pivotChar.innerHTML = token.substr(pivot, 1);
      rightWord.innerHTML = token.substr(pivot + 1)
      if (typeof dec !== "undefined") decorator.innerHTML = dec;

      word.offsetWidth;
      var pivotCenter = reticle.offsetLeft + (reticle.offsetWidth / 2);
      word.style.left = (pivotCenter - pivotChar.offsetLeft - (pivotChar.offsetWidth / 2)) + "px";
    };

    this.setWrap = function (left, right) {
      leftWrap.innerHTML = left;
      rightWrap.innerHTML = right;

      var lw = leftWrap.offsetWidth;
      var rw = rightWrap.offsetWidth;

      wrapper.style.paddingLeft = "50px";
      wrapper.style.paddingRight = "50px";
      if (lw > rw) {
        wrapper.style.paddingRight = 50 + (lw - rw) + "px";
      } else if (rw > lw) {
        wrapper.style.paddingLeft = 50 + (rw - lw) + "px";
      }
    };

    this.clear = function () {
      this.setWrap("", "");
      this.setWord("   ", "");
    };
  }

  view.Reader = Reader;

  // we only need one instance of Reader now.
  var readerSingleton;

  view.__defineGetter__("reader", function () {
    if (!readerSingleton) readerSingleton = new Reader();

    return readerSingleton;
  });


  var overlaidElems = [];

  /**
   * Makes an overlay for the given element.
   * Returns false if the overlay is off the bottom of the screen,
   * otherwise returns true;
   */
  view.addOverlay = function (elem) {
    var rect = elem.getBoundingClientRect();

    var overlay = H.div("sr-overlay");
    overlay.style.top = (H.getScrollTop() + rect.top) + "px";
    overlay.style.left = (H.getScrollLeft() + rect.left) + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
    overlay.style.backgroundColor = config("selection_color");
    document.body.appendChild(overlay);
    elem.___jetztOverlay = overlay;

    overlaidElems.push(elem);

    return rect.top < window.innerHeight;
  };

  view.removeOverlay = function (elem) {
    if (elem.___jetztOverlay) {
      elem.___jetztOverlay.remove();
      delete elem.___jetztOverlay;
      H.removeFromArray(overlaidElems, elem);
    }
  };

  view.removeAllOverlays = function () {
    for (var i = overlaidElems.length; i--;) {
      var elem = overlaidElems[i];
      elem.___jetztOverlay.remove();
      delete elem.___jetztOverlay;
    }
    overlaidElems = [];
  };



  var highlight;

  view.highlightRange = function (range) {
    // todo
  };


})(this);

(function (window) {

  var jetzt  = window.jetzt
    , H      = jetzt.helpers;

  function on (event, cb) {
    window.addEventListener(event, cb);
  }

  function off (event, cb) {
    window.removeEventListener(event, cb);
  }

  /**
   * Begin interactive dom node selection.
   */
  function selectMode () {
    var selection = [];
    var previousElement = null;

    var showSelection = function () {

      overlays = [];

      for (var i=0, len=selection.length; i < len; i++) {
        if (!jetzt.view.addOverlay(selection[i])) {
          break;
        }
      }
    };

    var setSelection = function (sel) {
      jetzt.view.removeAllOverlays();
      selection = sel;
      showSelection();
    };

    var validParents = {
      "DIV": true,
      "ARTICLE": true,
      "BLOCKQUOTE": true,
      "MAIN": true,
      "SECTION": true,
      "UL": true,
      "OL": true,
      "DL": true
    };

    var validChildren = {
      "P": true,
      "H1": true,
      "H2": true,
      "H3": true,
      "H4": true,
      "H5": true,
      "H6": true,
      "SPAN": true,
      "DL": true,
      "OL": true,
      "UL": true,
      "BLOCKQUOTE": true,
      "SECTION": true
    };

    var selectSiblings = function (el) {
      var firstChild = el;
      var parent = el.parentNode;
      while (parent && !validParents[parent.tagName]) {
        firstChild = parent;
        parent = firstChild.parentNode;

      }

      if (parent) {
        var kids = parent.childNodes
          , len = kids.length
          , result = []
          , i = 0;

          while (kids[i] !== firstChild) i++;

          for (; i < len; i++) {
            var kid = kids[i];
            if (validChildren[kid.tagName]) {
              result.push(kid);
            }
          }

          return result;

      } else {
        return [el];
      }
    };

    var stop = function () {
      jetzt.view.removeAllOverlays();
      off("mouseover", mouseoverHandler);
      off("mousemove", moveHandler);
      off("keydown", keydownHandler);
      off("keyup", keyupHandler);
      off("click", clickHandler);
      previousElement && H.removeClass(previousElement, "sr-pointer");
    };

    var mouseoverHandler = function (ev) {
      previousElement && H.removeClass(previousElement, "sr-pointer");

      H.addClass(ev.target, "sr-pointer");

      previousElement = ev.target;

      if (ev.altKey) {
        setSelection([ev.target]);
      } else {
        setSelection(selectSiblings(ev.target));
      }
    };

    var clickHandler = function (ev) {
      stop();
      jetzt.init(jetzt.parse.dom(selection));
    };

    var moveHandler = function (ev) {
      mouseoverHandler(ev);
      off("mousemove", moveHandler);
    };

    var keydownHandler = function (ev) {
      if (ev.keyCode === 27) {
        stop();
      } else if (ev.altKey && selection.length > 1) {
        setSelection([selection[0]]);
      }
    };

    var keyupHandler = function (ev) {
      if (!ev.altKey && selection.length === 1) {
        setSelection(selectSiblings(selection[0]));
      }
    };

    on("mouseover", mouseoverHandler);
    on("click", clickHandler);
    on("mousemove", moveHandler);
    on("keydown", keydownHandler);
    on("keyup", keyupHandler);
  }

  jetzt.select = function (contextData) {
    var text;
    if (contextData === undefined) {
      text = window.getSelection().toString();
    } else {
      text = contextData.selectionText;
    }
    if (text.trim().length > 0) {
      jetzt.init(jetzt.parse.string(text));
      window.getSelection().removeAllRanges();
    } else {
      selectMode();
    }
  };

})(this);



(function (window) {

  var jetzt = window.jetzt
    , H = jetzt.helpers
    , config = jetzt.config
    , control = {};

  jetzt.control = control;

  function killEvent (ev) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }

  /**
   * hooks an executor up to keyboard controls.
   */
  control.keyboard = function (executor) {
    jetzt.view.reader.onKeyDown(function (ev) {
      if(ev.ctrlKey || ev.metaKey) {
        return;
      }

      // handle custom keybindings eventually
      switch (ev.keyCode) {
        case 27: //esc
          killEvent(ev);
          jetzt.quit();
          break;
        case 38: //up
          killEvent(ev);
          config.adjustWPM(+10);
          break;
        case 40: //down
          killEvent(ev);
          config.adjustWPM(-10);
          break;
        case 37: //left
          killEvent(ev);
          if (ev.altKey) executor.prevParagraph();
          else executor.prevSentence();
          break;
        case 39: //right
          killEvent(ev);
          if (ev.altKey) executor.nextParagraph();
          else executor.nextSentence();
          break;
        case 32: //space
          killEvent(ev);
          executor.toggleRunning();
          break;
        case 187: // =/+ (MSIE, Safari, Chrome)
        case 107: // =/+ (Firefox, numpad)
        case 61: // =/+ (Firefox, Opera)
          killEvent(ev);
          config.adjustScale(0.1);
          break;
        case 109: // -/_ (numpad, Opera, Firefox)
        case 189: // -/_ (MSIE, Safari, Chrome)
        case 173: // -/_ (Firefox)
          killEvent(ev);
          config.adjustScale(-0.1);
          break;
        case 48: //0 key, for changing the theme
          killEvent(ev);
          config("dark", !config("dark"));
          break;
        case 191: // / and ?
          killEvent(ev);
          config("show_message", !config("show_message"));
          break;
      }

    });
  };

  window.addEventListener("keydown", function (ev) {
    if (!jetzt.isOpen() && ev.altKey && ev.keyCode === 83) {
      ev.preventDefault();
      jetzt.select();
    }
  });

})(this);

(function (window) {
  var jetzt  = window.jetzt
    , reader = jetzt.view.reader;


  /*** state ***/
  var executor;

  jetzt.init = function (instructions) {
    if (executor) throw new Error("jetzt already initialised");

    reader.clear();
    executor = jetzt.exec(instructions);
    jetzt.control.keyboard(executor);

    reader.show();
    reader.onBackdropClick(jetzt.quit);

    setTimeout(function () { executor.start(); }, 500);
  };

  jetzt.quit = function () {
    executor.stop();
    reader.hide();
    executor = null;
  };

  jetzt.isOpen = function () {
    return !!executor;
  };

})(this);
