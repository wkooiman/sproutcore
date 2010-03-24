// ==========================================================================
// Project:   SproutCore - JavaScript Application Framework
// Copyright: ©2006-2009 Sprout Systems, Inc. and contributors.
//            Portions ©2008-2009 Apple Inc. All rights reserved.
// License:   Licensed under MIT license (see license.js)
// ==========================================================================

require('system/ready');

/** @class

  The RootResponder captures events coming from a web browser and routes them 
  to the correct view in the view hierarchy.  Usually you do not work with a 
  RootResponder directly.  Instead you will work with Pane objects, which 
  register themselves with the RootResponder as needed to receive events.
  
  h1. RootResponder and Platforms
  
  RootResponder is implemented differently on the desktop and mobile platforms
  using a technique called a "class cluster".  That is, although you get a 
  RootResponder instance at some point, you will likely be working with a 
  subclass of RootResponder that implements functionality unique to that 
  platform.
  
  The RootResponder you use depends on the active platform you have set and
  the framework you have loaded.
  
  h1. Event Types 
  
  RootResponders can route four types of events:
  
  - Direct events.  Such as mouse and touch events.  These are routed to the 
    nearest view managing the target DOM elment.
  - Keyboard events.  These are sent to the keyPane, which will send it 
    to the current firstResponder.
  - resize. This event is sent to all panes.
  - shortcuts.  Shortcuts are sent to the focusedPane first, which will go 
    down its view hierarchy.  Then they go to the mainPane, which will go down
    its view hierarchy.  Then they go to the mainMenu.  Usually any handler 
    that picks this up will then try to do a sendAction().
  - actions.  Actions are sent down the responder chain.  They go to 
    focusedPane -> mainPane.  Each of these will start at the firstResponder 
    and work their way up the chain.
  
  Differences between Mobile + Desktop RootResponder
  
  The Desktop root responder can deal with the following kinds of events:
   mousedown, mouseup, mouseover, mouseout, mousemoved
*/
SC.RootResponder = SC.Object.extend({
  
  /**
    Contains a list of all panes currently visible on screen.  Everytime a 
    pane attaches or detaches, it will update itself in this array.
  */
  panes: null,
  
  init: function() {
    sc_super();
    this.panes = SC.Set.create();
  },
  
  // .......................................................
  // MAIN Pane
  // 
  
  /** @property
    The main pane.  This pane receives shortcuts and actions if the 
    focusedPane does not respond to them.  There can be only one main pane.  
    You can swap main panes by calling makeMainPane() here.
    
    Usually you will not need to edit the main pane directly.  Instead, you 
    should use a MainPane subclass, which will automatically make itself main 
    when you append it to the document.
  */
  mainPane: null,
  
  /** 
    Swaps the main pane.  If the current main pane is also the key pane, then 
    the new main pane will also be made key view automatically.  In addition 
    to simply updating the mainPane property, this method will also notify the
    panes themselves that they will lose/gain their mainView status.
    
    Note that this method does not actually change the Pane's place in the 
    document body.  That will be handled by the Pane itself.
    
    @param {SC.Pane} pane
    @returns {SC.RootResponder} receiver
  */
  makeMainPane: function(pane) {
    var currentMain = this.get('mainPane') ;
    if (currentMain === pane) return this ; // nothing to do
    
    this.beginPropertyChanges() ;
    
    // change key focus if needed.
    if (this.get('keyPane') === currentMain) this.makeKeyPane(pane) ;
    
    // change setting
    this.set('mainPane', pane) ;
    
    // notify panes.  This will allow them to remove themselves.
    if (currentMain) currentMain.blurMainTo(pane) ;
    if (pane) pane.focusMainFrom(currentMain) ;
    
    this.endPropertyChanges() ;
    return this ;
  }, 
  
  // .......................................................
  // KEY ROOT VIEW
  // 
  
  /** @property
    The current key pane.  This pane receives keyboard events, shortcuts, and 
    actions first.  This pane is usually the highest ordered pane or the 
    mainPane.
  */
  keyPane: null,
    
  /** @property
    A stack of the previous key panes.
    
    *IMPORTANT: Property is not observable*
  */
  previousKeyPanes: [],
  
  /**
    Makes the passed pane the new key pane.  If you pass nil or if the pane 
    does not accept key focus, then key focus will transfer to the previous
    key pane (if it is still attached), and so on down the stack.  This will
    notify both the old pane and the new root View that key focus has changed.
    
    @param {SC.Pane} pane
    @returns {SC.RootResponder} receiver
  */
  makeKeyPane: function(pane) {
    // Was a pane specified?
    var newKeyPane, previousKeyPane, previousKeyPanes ;
    
    if (pane) {
      // Does the specified pane accept being the key pane?  If not, there's
      // nothing to do.
      if (!pane.get('acceptsKeyPane')) {
        return this ;
      }
      else {
        // It does accept key pane status?  Then push the current keyPane to
        // the top of the stack and make the specified pane the new keyPane.
        // First, though, do a sanity-check to make sure it's not already the
        // key pane, in which case we have nothing to do.
        previousKeyPane = this.get('keyPane') ;
        if (previousKeyPane === pane) {
          return this ;
        }
        else {
          if (previousKeyPane) {
            previousKeyPanes = this.get('previousKeyPanes') ;
            previousKeyPanes.push(previousKeyPane) ;
          }
          
          newKeyPane = pane ;
        }
      }
    }
    else {
      // No pane was specified?  Then pop the previous key pane off the top of
      // the stack and make it the new key pane, assuming that it's still
      // attached and accepts key pane (its value for acceptsKeyPane might
      // have changed in the meantime).  Otherwise, we'll keep going up the
      // stack.
      previousKeyPane = this.get('keyPane') ;
      previousKeyPanes = this.get('previousKeyPanes') ;
  
      newKeyPane = null ;
      while (previousKeyPanes.length > 0) {
        var candidate = previousKeyPanes.pop();
        if (candidate.get('isPaneAttached')  &&  candidate.get('acceptsKeyPane')) {
          newKeyPane = candidate ;
          break ;
        }
      }
    }
    
    
    // If we found an appropriate candidate, make it the new key pane.
    // Otherwise, make the main pane the key pane (if it accepts it).
    if (!newKeyPane) {
      var mainPane = this.get('mainPane') ;
      if (mainPane && mainPane.get('acceptsKeyPane')) newKeyPane = mainPane ;
    }
    
    // now notify old and new key views of change after edit    
    if (previousKeyPane) previousKeyPane.willLoseKeyPaneTo(newKeyPane) ;
    if (newKeyPane) newKeyPane.willBecomeKeyPaneFrom(previousKeyPane) ;
    
    this.set('keyPane', newKeyPane) ;
    
    if (newKeyPane) newKeyPane.didBecomeKeyPaneFrom(previousKeyPane) ;
    if (previousKeyPane) previousKeyPane.didLoseKeyPaneTo(newKeyPane) ;
    
    return this ;
  },
  
  /**
    Overridden by subclasses to return the window size.  The default simply
    returns 640 x 480.
    
    @returns {Size} the size of the window in pixels
  */
  computeWindowSize: function() { 
    return { width: 640, height: 480 } ;
  },
  
  // .......................................................
  // ACTIONS
  // 
  
  /** @property
    Set this to a delegate object that can respond to actions as they are sent
    down the responder chain.
  */
  defaultResponder: null,
  
  /**
    Route an action message to the appropriate responder.  This method will 
    walk the responder chain, attempting to find a responder that implements 
    the action name you pass to this method.  Set 'tagret' to null to search 
    the responder chain.
    
    IMPORTANT: This method's API and implementation will likely change 
    significantly after SproutCore 1.0 to match the version found in 
    SC.ResponderContext.
    
    You generally should not call or override this method in your own 
    applications.
    
    @param {String} action The action to perform - this is a method name.
    @param {SC.Responder} target object to set method to (can be null)
    @param {Object} sender The sender of the action
    @param {SC.Pane} pane optional pane to start search with
    @param {Object} context optional. only passed to ResponderContexts
    @returns {Boolean} YES if action was performed, NO otherwise
    @test in targetForAction
  */
  sendAction: function( action, target, sender, pane, context) {
    target = this.targetForAction(action, target, sender, pane) ;
    
    // HACK: If the target is a ResponderContext, forward the action.
    if (target && target.isResponderContext) {
      return !!target.sendAction(action, sender, context);
    } else return target && target.tryToPerform(action, sender);
  },
  
  _responderFor: function(target, methodName) {
    var defaultResponder = target ? target.get('defaultResponder') : null;

    if (target) {
      target = target.get('firstResponder') || target;
      do {
        if (target.respondsTo(methodName)) return target ;
      } while (target = target.get('nextResponder')) ;
    }

    // HACK: Eventually we need to normalize the sendAction() method between
    // this and the ResponderContext, but for the moment just look for a 
    // ResponderContext as the defaultResponder and return it if present.
    if (typeof defaultResponder === SC.T_STRING) {
      defaultResponder = SC.objectForPropertyPath(defaultResponder);
    }

    if (!defaultResponder) return null;
    else if (defaultResponder.isResponderContext) return defaultResponder;
    else if (defaultResponder.respondsTo(methodName)) return defaultResponder;
    else return null;
  },
  
  /**
    Attempts to determine the initial target for a given action/target/sender 
    tuple.  This is the method used by sendAction() to try to determine the 
    correct target starting point for an action before trickling up the 
    responder chain.
    
    You send actions for user interface events and for menu actions.
    
    This method returns an object if a starting target was found or null if no
    object could be found that responds to the target action.
    
    Passing an explicit target or pane constrains the target lookup to just
    them; the defaultResponder and other panes are *not* searched.
    
    @param {Object|String} target or null if no target is specified
    @param {String} method name for target
    @param {Object} sender optional sender
    @param {SC.Pane} optional pane
    @returns {Object} target object or null if none found
  */
  targetForAction: function(methodName, target, sender, pane) {
    
    // 1. no action, no target...
    if (!methodName || (SC.typeOf(methodName) !== SC.T_STRING)) {
      return null ;
    }
    
    // 2. an explicit target was passed...
    if (target) {
      if (SC.typeOf(target) === SC.T_STRING) {
        target = SC.objectForPropertyPath(target) ;
      }
      
      if (target) {
        if (target.respondsTo && !target.respondsTo(methodName)) {
          target = null ;
        } else if (SC.typeOf(target[methodName]) !== SC.T_FUNCTION) {
          target = null ;
        }
      }
      
      return target ;
    }
    
    // 3. an explicit pane was passed...
    if (pane) {
      return this._responderFor(pane, methodName) ;
    }
    
    // 4. no target or pane passed... try to find target in the active panes
    // and the defaultResponder
    var keyPane = this.get('keyPane'), mainPane = this.get('mainPane') ;
    
    // ...check key and main panes first
    if (keyPane && (keyPane !== pane)) {
      target = this._responderFor(keyPane, methodName) ;
    }
    if (!target && mainPane && (mainPane !== keyPane)) {
      target = this._responderFor(mainPane, methodName) ;
    }
    
    // ...still no target? check the defaultResponder...
    if (!target && (target = this.get('defaultResponder'))) {
      if (SC.typeOf(target) === SC.T_STRING) {
        target = SC.objectForPropertyPath(target) ;
        if (target) this.set('defaultResponder', target) ; // cache if found
      }
      if (target) {
        if (target.respondsTo && !target.respondsTo(methodName)) {
          target = null ;
        } else if (SC.typeOf(target[methodName]) !== SC.T_FUNCTION) {
          target = null ;
        }
      }
    }
    
    return target ;
  },
  
  /**
    Finds the view that appears to be targeted by the passed event.  This only
    works on events with a valid target property.
    
    @param {SC.Event} evt
    @returns {SC.View} view instance or null
  */
  targetViewForEvent: function(evt) {
    return evt.target ? SC.$(evt.target).view()[0] : null ;
  },

  /**
    Attempts to send an event down the responder chain.  This method will 
    invoke the sendEvent() method on either the keyPane or on the pane owning 
    the target view you pass in.  It will also automatically begin and end 
    a new run loop.
    
    If you want to trap additional events, you should use this method to 
    send the event down the responder chain.
    
    @param {String} action
    @param {SC.Event} evt
    @param {Object} target
    @returns {Object} object that handled the event or null if not handled
  */
  sendEvent: function(action, evt, target) {
    var pane, ret ;
     
    SC.RunLoop.begin() ;
    
    // get the target pane
    if (target) pane = target.get('pane') ;
    else pane = this.get('keyPane') || this.get('mainPane') ;
    
    // if we found a valid pane, send the event to it
    ret = (pane) ? pane.sendEvent(action, evt, target) : null ;
    
    SC.RunLoop.end() ;
    
    return ret ;
  },

  // .......................................................
  // EVENT LISTENER SETUP
  // 
  
  /**
    Default method to add an event listener for the named event.  If you simply 
    need to add listeners for a type of event, you can use this method as 
    shorthand.  Pass an array of event types to listen for and the element to 
    listen in.  A listener will only be added if a handler is actually installed 
    on the RootResponder of the same name.
    
    @param {Array} keyNames
    @param {Element} target
    @returns {SC.RootResponder} receiver
  */
  listenFor: function(keyNames, target) {
    keyNames.forEach( function(keyName) {
      var method = this[keyName] ;
      if (method) SC.Event.add(target, keyName, this, method) ;
    },this) ;
    target = null ;
    return this ;
  },
  
  /** 
    Called when the document is ready to begin handling events.  Setup event 
    listeners in this method that you are interested in observing for your 
    particular platform.  Be sure to call sc_super().
    
    @returns {void}
  */
  setup: function() {
    this.listenFor('touchstart touchmove touchend touchcancel'.w(), document);
    
    if (SC.browser.touch) {
      var elem = document.createElement('div');
      elem.id = 'sc-touch-intercept';
      elem.style.position = 'absolute';
      elem.style.top = '0px';
      elem.style.left = '0px';
      elem.style.bottom = '0px';
      elem.style.right = '0px';
      elem.style.zIndex = 999;
      elem.style.webkitUserSelect = "none";

      document.body.appendChild(elem);
      this._touchInterceptElement = elem;
      elem = null;
    }
  },
  
  // ................................................................................
  // TOUCH SUPPORT
  //
  /*
    This touch support is written to meet the following specifications. They are actually
    simple, but I decided to write out in great detail all of the rules so there would
    be no confusion.
    
    There are three events: touchStart, touchEnd, touchDragged. touchStart and End are called
    individually for each touch. touchDragged events are sent to whatever view owns the touch
    event
  */
  
  /**
    @private
    A map from views to internal touch entries.
    
    Note: the touch entries themselves also reference the views.
  */
  _touchedViews: {},
  
  /**
    @private
    A map from internal touch ids to the touch entries themselves.
    
    The touch entry ids currently come from the touch event's identifier.
  */
  _touches: {},
  
  /**
    Returns the touches that are registered to the specified view; undefined if none.
    
    When views receive a touch event, they have the option to subscribe to it.
    They are then mapped to touch events and vice-versa. This returns touches mapped to the view.
  */
  touchesForView: function(view) {
    if (this._touchedViews[SC.guidFor(view)]) {
      return this._touchedViews[SC.guidFor(view)].touches;
    }
  },
  
  /**
    Computes a hash with x, y, and d (distance) properties, containing the average position
    of all touches, and the average distance of all touches from that average.
    
    This is useful for implementing scaling.
  */
  averagedTouchesForView: function(view) {
    var t = this.touchesForView(view);
    if (!t || t.length === 0) return {x: 0, y: 0, d: 0, touchCount: 0};
    
    var touches = t.toArray(), idx, len = touches.length, touch,
        ax = 0, ay = 0, dx, dy, ad;
    
    // first, add
    for (idx = 0; idx < len; idx++) {
      touch = touches[idx];
      ax += touch.pageX; ay += touch.pageY;
    }
    
    // now, average
    ax /= len;
    ay /= len;
    
    // distance
    for (idx = 0; idx < len; idx++) {
      touch = touches[idx];
      
      // get distance from average
      dx = Math.abs(touch.pageX - ax);
      dy = Math.abs(touch.pageY - ay);
      
      // Pythagoras was clever...
      ad += Math.pow(dx * dx + dy * dy, 0.5);
    }
    
    // average
    ad /= len;
    
    // return
    return {
      x: ax,
      y: ay,
      d: ad,
      touchCount: len
    };
  },
  
  assignTouch: function(touch, view) {
    // create view entry if needed
    if (!this._touchedViews[SC.guidFor(view)]) {
      this._touchedViews[SC.guidFor(view)] = {
        view: view,
        touches: SC.CoreSet.create([]),
        touchCount: 0
      };
      view.set("hasTouch", YES);
    }
    
    // add touch
    touch.view = view;
    this._touchedViews[SC.guidFor(view)].touches.add(touch);
    this._touchedViews[SC.guidFor(view)].touchCount++;
  },
  
  unassignTouch: function(touch) {
    // find view entry
    var view, viewEntry;
    
    // get view
    if (!touch.view) return; // touch.view should===touch.touchResponder eventually :)
    view = touch.view;
    
    // get view entry
    viewEntry = this._touchedViews[SC.guidFor(view)];
    viewEntry.touches.remove(touch);
    viewEntry.touchCount--;
    
    // remove view entry if needed
    if (viewEntry.touchCount < 1) {
      view.set("hasTouch", NO);
      viewEntry.view = null;
      delete this._touchedViews[SC.guidFor(view)];
    }
    
    // clear view
    touch.view = undefined;
  },
  
  /**
    The touch responder for any given touch is the view which will receive touch events
    for that touch. Quite simple.
    
    makeTouchResponder takes a potential responder as an argument, and, by calling touchStart on each
    nextResponder, finds the actual responder. As a side-effect of how it does this, touchStart is called
    on the new responder before touchCancelled is called on the old one (touchStart has to accept the touch
    before it can be considered cancelled).
    
    You usually don't have to think about this at all. However, if you don't want your view to,
    for instance, prevent scrolling in a ScrollView, you need to make sure to transfer control
    back to the previous responder:
    
    if (Math.abs(touch.pageY - touch.startY) > this.MAX_SWIPE) touch.restoreLastTouchResponder();
    
    You don't call makeTouchResponder on RootResponder directly. Instead, it gets called for you
    when you return YES to captureTouch or touchStart.
    
    You do, however, use a form of makeTouchResponder to return to a previous touch responder. Consider
    a button view inside a ScrollView: if the touch moves too much, the button should give control back
    to the scroll view.
    
    if (Math.abs(touch.pageX - touch.startX) > 4) {
      if (touch.nextTouchResponder) touch.makeTouchResponder(touch.nextTouchResponder);
    }
    
    This will give control back to the containing view. Maybe you only want to do it if it is a ScrollView?
    
    if (Math.abs(touch.pageX - touch.startX) > 4 && touch.nextTouchResponder && touch.nextTouchResponder.isScrollable)
      touch.makeTouchResponder(touch.nextTouchResponder);
    
    Possible gotcha: while you can do touch.nextTouchResponder, the responders are not chained in a linked list like
    normal responders, because each touch has its own responder stack. To navigate through the stack (or, though
    it is not recommended, change it), use touch.touchResponders (the raw stack array).
    
    makeTouchResponder is called with an event object. However, it usually triggers custom touchStart/touchCancelled
    events on the views. The event object is passed so that functions such as stopPropagation may be called.
  */
  makeTouchResponder: function(touch, responder, shouldStack) {
    var stack = touch.touchResponders, touchesForView;

    // find the actual responder (if any, I suppose)
    // note that the pane's sendEvent function is slightly clever:
    // if the target is already touch responder, it will just return it without calling touchStart
    // we must do the same.
    if (touch.touchResponder === responder) return;
    
    // send touchStart
    responder = this.sendEvent("touchStart", touch, responder);

    // and again, now that we have more detail.
    if (touch.touchResponder === responder) return;    
    
    // if the item is in the stack, we will go to it (whether shouldStack is true or not) 
    // as it is already stacked
    this.unassignTouch(touch);
    if (!shouldStack || (stack.indexOf(responder) > -1 && stack[stack.length - 1] !== responder)) {
      
      // pop all other items
      var idx = stack.length - 1, last = stack[idx];
      while (last && last !== responder) {
        // unassign the touch
        touchesForView = this.touchesForView(last); // won't even exist if there are no touches
        
        // send touchCancelled (or, don't, if the view doesn't accept multitouch and it is not the last touch)
        if (last.get("acceptsMultitouch") || !touchesForView) {
          last.tryToPerform("touchCancelled", touch);
        }
        
        // go to next (if < 0, it will be undefined, so lovely)
        idx--;
        last = stack[idx];
        
        // update responders (for consistency)
        stack.pop();
        
        touch.touchResponder = stack[idx];
        touch.nextTouchResponder = stack[idx - 1];
      }
      
    }
    
    // now that we've popped off, we can push on
    if (responder) {
      this.assignTouch(touch, responder);
      stack.push(responder);
      
      // update responder helpers
      touch.touchResponder = responder;
      touch.nextTouchResponder = stack[stack.length - 2];
    }
  },
  
  /**
    captureTouch is used to find the view to handle a touch. It starts at the starting point and works down
    to the touch's target, looking for a view which captures the touch. If no view is found, it uses the target
    view.
    
    Then, it triggers a touchStart event starting at whatever the found view was; this propagates up the view chain
    until a view responds YES. This view becomes the touch's owner.
    
    You usually do not call captureTouch, and if you do call it, you'd call it on the touch itself:
    touch.captureTouch(startingPoint, shouldStack)
    
    If shouldStack is YES, the previous responder will be kept so that it may be returned to later.
  */
  captureTouch: function(touch, startingPoint, shouldStack) {
    if (!startingPoint) startingPoint = this;
    
    var target = touch.targetView, view = target,
        chain = [], idx, len;
    
    // work up the chain until we get the root
    while (view && (view !== startingPoint)) {
      chain.push(view);
      view = view.get('nextResponder');
    }
    
    // work down the chain
    for (len = chain.length, idx = 0; idx < len; idx++) {
      view = chain[idx];
      
      // see if it captured the touch
      if (view.tryToPerform('captureTouch', touch)) {
        // if so, make it the touch's responder
        this.makeTouchResponder(touch, view, shouldStack); // triggers touchStart/Cancel/etc. event.
        return; // and that's all we need
      }
    }
    
    // if we did not capture the touch (obviously we didn't)
    // we need to figure out what view _will_
    // Thankfully, makeTouchResponder does exactly that: starts at the view it is supplied and keeps calling startTouch
    this.makeTouchResponder(touch, target, shouldStack);
  },

  /**
    Triggers touchStart on views.
    
    @param {Event} evt the event
    @returns {Boolean}
  */
  touchstart: function(evt) {
    try {
      // loop through changed touches, calling touchStart, etc.
      var idx, touches = evt.changedTouches, len = touches.length, target, view, touch, touchEntry;
      
      // prepare event for touch mapping.
      evt.touchContext = this;
      
      // each touch
      for (idx = 0; idx < len; idx++) {
        touch = touches[idx];

        
        // prepare a touch entry (our internal representation)
        touchEntry = SC.Touch.create(touch, this);
        touchEntry.timeStamp = evt.timeStamp;
        
        // map touch
        this._touches[touch.identifier] = touchEntry;
        
        // set the event (so default action, etc. can be stopped)
        touch.event = evt; // will be unset momentarily
        
        // send out event thing: creates a chain, goes up it, then down it, with startTouch and cancelTouch.
        // in this case, only startTouch, as there are no existing touch responders.
        // We send the touchEntry because it is cached (we add the helpers only once)
        this.captureTouch(touchEntry, this);
        
        // and, unset
        touch.event = null;
        
      }
    } catch (e) {
      SC.Logger.warn('Exception during touchStart: %@'.fmt(e)) ;
      this._touchViews = null ;
      SC.RunLoop.end();
      return NO ;
    }

    return NO;
  },

  /**
    @private
    used to keep track of when a specific type of touch event was last handled, to see if it needs to be re-handled
  */
  touchmove: function(evt) {
    SC.RunLoop.begin();
    try {
      // pretty much all we gotta do is update touches, and figure out which views need updating.
      var touches = evt.changedTouches, touch, touchEntry,
          idx, len = touches.length, view, changedTouches, viewTouches, firstTouch,
          changedViews = {};
      
      // figure out what views had touches changed, and update our internal touch objects
      for (idx = 0; idx < len; idx++) {
        touch = touches[idx];
        
        // get our touch
        touchEntry = this._touches[touch.identifier];
        
        // sanity-check
        if (!touchEntry) {
          console.log("Received a touchmove for a touch we don't know about. This is bad.");
          continue;
        }
        
        // update touch
        touchEntry.pageX = touch.pageX;
        touchEntry.pageY = touch.pageY;
        touchEntry.timeStamp = evt.timeStamp;
        touchEntry.event = evt;
        
        // if the touch entry has a view
        if (touchEntry.touchResponder) {
          view = touchEntry.touchResponder;
          
          // create a view entry
          if (!changedViews[SC.guidFor(view)]) changedViews[SC.guidFor(view)] = { "view": view, "touches": [] };
          
          // add touch
          changedViews[SC.guidFor(view)].touches.push(touchEntry);
        }
      }
      
      // loop through changed views and send events
      for (idx in changedViews) {
        // get info
        view = changedViews[idx].view;
        changedTouches = changedViews[idx].touches;
        
        // prepare event; note that views often won't use this method anyway (they'll call touchesForView instead)
        evt.viewChangedTouches = changedTouches;
        
        // the first VIEW touch should be the touch info sent
        viewTouches = this.touchesForView(view);
        firstTouch = viewTouches.firstObject();
        evt.pageX = firstTouch.pageX;
        evt.pageY = firstTouch.pageY;
        evt.touchContext = this; // so it can call touchesForView
        
        // and go
        view.tryToPerform("touchesDragged", evt, viewTouches);
      }
      
      // clear references to event
      touches = evt.changedTouches;
      len = touches.length;
      for (idx = 0; idx < len; idx++) {
        // and remove event reference
        touchEntry.event = null;
      }
    } catch (e) {
      SC.Logger.warn('Exception during touchMove: %@'.fmt(e)) ;
    }
    SC.RunLoop.end();
    return NO;
  },

  touchend: function(evt) {
    SC.RunLoop.begin();
    try {
      var touches = evt.changedTouches, touch, touchEntry,
          idx, len = touches.length, 
          view, 
          action = evt.isCancel ? "touchCancelled" : "touchEnd",
          responderIdx, responders, responder;
      
      for (idx = 0; idx < len; idx++) {
        //get touch+entry
        touch = touches[idx];
        touchEntry = this._touches[touch.identifier];
        touchEntry.timeStamp = evt.timeStamp;
        touchEntry.pageX = touch.pageX;
        touchEntry.pageY = touch.pageY;
        
        // unassign
        this.unassignTouch(touchEntry);
        
        // call end for all items in chain
        if (touchEntry.touchResponder) {
          responders = touchEntry.touchResponders;
          responderIdx = responders.length - 1;
          responder = responders[responderIdx];
          
          while (responder) {
            // tell it
            responder.tryToPerform(action, touchEntry, evt);
            
            // next
            responderIdx--;
            responder = responders[responderIdx];
            action = "touchCancelled"; // any further ones receive cancelled
          }
        }
        
        // clear responders (just to be thorough)
        touchEntry.touchResponders = null;
        touchEntry.touchResponder = null;
        touchEntry.nextTouchResponder = null;
        
        // and remove from our set
        delete this._touches[touchEntry.identifier];
      }
    } catch (e) {
      SC.Logger.warn('Exception during touchEnd: %@'.fmt(e)) ;
      this._touchViews = null ;
      SC.RunLoop.end();
      return NO ;
    }
    
    SC.RunLoop.end();
    return NO;
  },

  /** @private
    Handle touch cancel event.  Works just like cancelling a touch for any other reason.
    touchend handles it as a special case (sending cancel instead of end if needed).
  */
  touchcancel: function(evt) {
    evt.isCancel = YES;
    this.touchend(evt);
  }
});

/**
  @class SC.Touch
  Represents a touch.
  
  Views receive touchStart and touchEnd.
*/
SC.Touch = function(touch, touchContext) {
  // get the raw target view (we'll refine later)
  this.touchContext = touchContext;
  this.identifier = touch.identifier; // for now, our internal id is WebKit's id.
  this.targetView = touch.targetNode ? SC.$(touch.targetNode).view()[0] : null;
  this.target = touch.targetNode;
  
  this.view = undefined;
  this.touchResponder = this.nextTouchResponder = undefined;
  this.touchResponders = [];
  
  this.startX = this.pageX = touch.pageX;
  this.startY = this.pageY = touch.pageY;
};

SC.Touch.prototype = {
  /**@scope SC.Touch.prototype*/
  
  /**
    If the touch is associated with an event, prevents default action on the event.
  */
  preventDefault: function() {
    if (this.event) this.event.preventDefault();
  },
  
  stopPropagation: function() {
    if (this.event) this.event.stopPropagation();
  },
  
  stop: function() {
    if (this.event) this.event.stop();
  },

  /**
    Changes the touch responder for the touch. If shouldStack === YES,
    the current responder will be saved so that the next responder may
    return to it.
  */
  makeTouchResponder: function(responder, shouldStack) {
    this.touchContext.makeTouchResponder(this, responder, shouldStack);
  },
  
  /**
    Captures, or recaptures, the touch. This works from the touch's raw target view
    up to the startingPoint, and finds either a view that returns YES to captureTouch() or
    touchStart().
  */
  captureTouch: function(startingPoint, shouldStack) {
    this.touchContext.captureTouch(this, startingPoint, shouldStack);
  },
  
  /**
    Returns all touches for a specified view. Put as a convenience on the touch itself; this method
    is also available on the event.
  */
  touchesForView: function(view) {
    return this.touchContext.touchesForView(view);
  },
  
  /**
    Returns average data--x, y, and d (distance)--for the touches owned by the supplied view.
    
    addSelf adds this touch to the set being considered. This is useful from touchStart. If
    you use it from anywhere else, it will make this touch be used twice--so use caution.
  */
  averagedTouchesForView: function(view, addSelf) {
    var ret = this.touchContext.averagedTouchesForView(view);
    if (addSelf) {
      // reaverage x
      ret.x *= ret.touchCount;
      ret.y *= ret.touchCount;
      ret.x += this.pageX;
      ret.y += this.pageY;
      ret.x /= ret.touchCount + 1;
      ret.y /= ret.touchCount + 1;
    
      // reaverage distance
      ret.d *= ret.touchCount;
      ret.d += Math.pow(Math.pow(Math.abs(this.pageX - ret.x), 2), Math.pow(Math.abs(this.pageY - ret.y), 2), 0.5);
      ret.d /= ret.touchCount + 1;
    
      // update touch count
      ret.touchCount += 1;
    }
    
    // return
    return ret;
  }
};

SC.mixin(SC.Touch, {
  create: function(touch, touchContext) {
    return new SC.Touch(touch, touchContext);
  }
});

/* 
  Invoked when the document is ready, but before main is called.  Creates 
  an instance and sets up event listeners as needed.
*/
SC.ready(SC.RootResponder, SC.RootResponder.ready = function() {
  var r;
  r = SC.RootResponder.responder = SC.RootResponder.create() ;
  r.setup() ;
});
