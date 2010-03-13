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

  /**
    Attempts to send a touch event down the responder chain.  This differs
    from the standard sendEvent method by supporting event methods that
    return SC.MIXED. In this case, it will continue to bubble up the chain
    until the end is reached or a different view returns YES.

    @param {String} action
    @param {SC.Event} evt
    @param {Object} target
    @returns {Array} views the views that handled the event
  */
  sendTouchEvent: function(action, evt, target) {
    var pane, ret ;
    SC.RunLoop.begin() ;

    // get the target pane
    if (target) pane = target.get('pane') ;
    else pane = this.get('keyPane') || this.get('mainPane') ;

    // if we found a valid pane, send the event to it
    ret = (pane) ? pane.sendTouchEvent(action, evt, target) : null ;

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
    - Views receive touchStart and touchEnd events
    - Each touchStart and touchEnd event has a set of touches that were started or ended.
    - Each view receiving the touchStart and touchEnd events has its own list of touches
      started or ended (viewChangedTouches).
    - When receiving a touchStart and touchEnd event, views can subscribe, subscribe
      exclusively, or ignore the event.
    - If views subscribe, they will receive touchDragged events for the touches they
    - Each view receiving ANY touch event has a list of touches the view subscribes to,
      barring the ones being started or ended (if in a touchStart/End event), as these will
      not have been subscribed to yet.
    - Any view the touches move over will receive touchEntered, Exited, and Moved events.
      Any view at all.
    - If a touch starts on a view and then moves, the view will receive, in order,
      touchStart, touchEntered, touchDragged. 
    - As a touch moves over a view, touchMoved will be called. Both tuchMoved and touchDragged
      will be called if the view is subscribed to the touch.
    - If a touch exits a view, touchExited will be called. 
    - If a view subscribes to a touch, touchDragged will keep being called as the touch moves,
      even if it has exited the view.
    - Views subscribe by returning YES for exclusive subscription, NO for ignore, and
      SC.MIXED_STATE for nonexclusive subscription.
    - A touchDragged event can change the subscription by returning NO or YES. To leave things
      the way they are, the view should not return either YES or NO.
    - If subscription status is changed during a touchDragged, all other views subscribed to those
      touches should be notified that the touch was cancelled.
    - Views may stop propagation of touchDragged to other views by returning SC.STOP_DRAG_PROPAGATION;
      this will allow the other subscribed views to stay subscribed, but not inform them of the drag.
      Use case: view that can be swiped right for deletion that is a child of a ScrollView. It can
      stop the event from going to the scroll view until the child is sure it does not want it.
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
    return this._touchedViews[SC.guidFor(view)];
  },
  
  /**
    @private
    Returns the actual touch events for a view, given a view and a map of touch ids to touch objects.
  */
  eventTouchesForView: function(view, touchMap) {
    var viewTouches = this._touchedViews[SC.guidFor(view)].touches, 
        ret = [], idx, len = viewTouches.length, id;
    for (idx = 0; idx < length; idx++) {
      id = viewTouches[idx].identifier;
      if (touchMap[id]) ret.push(touchMap[id]);
    }
    return ret;
  },
  
  /**
    @private
    Creates a touch map (map of touch ids in an event to the touches themselves).
  */
  makeTouchMap: function(evt) {
    var idx, len = evt.touches.length, ret = {};
    for (idx = 0; idx < len; idx++) {
      ret[evt.touches[idx].identifier] = evt.touches[idx];
    }
    return ret;
  },

  /**
    Called when the user first touches a view.

    When this happens, we send the event up the view chain to see who is
    interested in subscribing to future related touch events. A view may
    respond with YES to get exclusive control, or may respond with
    SC.MIXED_STATE to get a non-exclusive subscription.

    @param {Event} evt the event
    @returns {Boolean}
  */
  touchstart: function(evt) {
    try {
      // for every changed touch, we must find the raw target view, and batch in that way.
      // then, for each changed view, 
      var idx, touches = evt.changedTouches, len = touches.length, touch, touchIdx, touchLen,
          viewKey, viewEntry, touchedViewEntry, touchEntry, touchEntries = this._touches, changedViews = {}, touchedViews;
      
      // each touch
      for (idx = 0; idx < len; idx++) {
        touch = touches[idx];
        
        // get the raw target view (we'll refine later)
        var view = this.targetViewForEvent(touch);
        
        // and add if needed
        if (!changedViews[SC.guidFor(view)]) viewEntry = changedViews[SC.guidFor(view)] = { view: view, touches: [] };
        viewEntry.touches.push(touch);
        
        // create a touch entry
        touchEntries[touch.identifier] = {
          views: [],
          lastX: touch.pageX,
          lastY: touch.pageY,
          identifier: touch.identifier // could be replaced with an internal one later
        };
      }
      
      
      // call events, register views with touches, and touches with views
      for (viewKey in changedViews) {
        viewEntry = changedViews[viewKey];
        view = viewEntry.view;
        
        // set changed touches
        evt.viewChangedTouches = viewEntry.touches;
        
        // call sendTouchEvent with _this_ as the source for viewTouches (touchesForViews)
        touchedViews = this.sendTouchEvent('touchStart', evt, view, this);
        
        // get an entry
        if (!this._touchedViews[viewKey]) this._touchedViews[viewKey] = {touches: []};
        touchedViewEntry = this._touchedViews[viewKey];
        
        // loop through touched views
        len = touchedViews.length;
        for (idx = 0; idx < len; idx++) {
          // get the _real_ view
          view = touchedViews[idx];
          
          // set hasTouch so the pane knows not to send touches again to ones that don't acceptMultitouch
          view.set("hasTouch", YES);
          
          // add view to touchEntry
          touchLen = touches.length;
          for (touchIdx = 0; touchIdx < touchLen; touchIdx++) {
            touchEntry = touches[touchIdx];
            
            // add view entry to touch entry
            touchEntry.views.push(touchedViewEntry);
            
            // and touch entry to view touch entry
            touchedViewEntry.touches.push(touchEntry);
          }
        }
        
        
      }
    } catch (e) {
      SC.Logger.warn('Exception during touchStart: %@'.fmt(e)) ;
      this._touchViews = null ;
      return NO ;
    }

    return view ? evt.hasCustomEventHandling : YES;
  },

  /**
    @private
    used to keep track of when a specific type of touch event was last handled, to see if it needs to be re-handled
  */
  _touch_move_generation: 0,
  touchmove: function(evt) {
    SC.RunLoop.begin();
    try {
      // HOLY VARIABLES BATMAN! I think some of these could be consolidated.
      var touches = evt.changedTouches, idx, len, touch, 
          touchEntry, touchEntries = this._touches, targetView, view,
          touchViews, touchViewIdx, touchViewLen, touchView,
          lh, nh, hoverIdx, hoverLen,
          viewChanges = {}, viewChangeEntry, viewKey,
          touchesForSubscriber = {}, touchMap = this.makeTouchMap(evt);
      
      
      /* ...........................................................................
        First Step:
        - Loops through the changed touches
        - Determines if the touch has entered, exited, or moved in any views; if so,
          queues the event for later dispatch (in viewChanges).
        - Fills a Subscriber -> [Touches] map for later use (touchesForSubscriber)
        ..............................................................................*/
      for (len = touches.length, idx = 0; idx < len; idx++) {
        touch = touches[idx];
        
        // get touch entry
        touchEntry = this._touches[touch.identifier];
        
        // sanity check
        if (!touchEntry) {
          console.log("Received a touchmove for a touch we never got touchstart for. This is a problem.");
          continue;
        }
        
        // get target view
        targetView = this.targetViewForEvent(touch);
        
        // get last hovered. At start, it is the touch start view set (the touch entry's views)
        lh = touchEntry.lastHovered || [];
        nh = [];
        
        // walk up the view chain and determine if our target has changed
        // triggering touchEntered/Exited
        while (targetView && (targetView !== this)) {
          if (lh.indexOf(targetView) !== -1) {
            // this means that it was entered before
            // so just send touchMoved
            
            // get queue entry
            viewKey = SC.guidFor(targetView);
            if (!viewChanges[viewKey]) viewChanges[viewKey] = { view: targetView, moved: [] };
            if (!viewChanges[viewKey].moved) viewChanges[viewKey].moved = [];
            viewChanges[viewKey].moved.push(touch);
            
            // and we are hovering over it
            nh.push(targetView);
          } else {
            // this means that we have NOT entered before
            // so send touchEntered
            
            // well, queue it, at least
            viewKey = SC.guidFor(targetView);
            if (!viewChanges[viewKey]) viewChanges[viewKey] = { view: targetView, entered: [] };
            if (!viewChanges[viewKey].entered) viewChanges[viewKey].entered = [];
            viewChanges[viewKey].entered.push(touch);
            
            nh.push(targetView);
          }
          
          // next...
          targetView = targetView.get("nextResponder");
        }
        
        for (hoverIdx = 0, hoverLen = lh.length; hoverIdx < hoverLen; hoverIdx++) {
          targetView = lh[hoverIdx];
          
          // call touchExited if needed and possible
          if (targetView.respondsTo('touchExited') && nh.indexOf(targetView) === -1) {
            // queuing action
            viewKey = SC.guidFor(targetView);
            if (!viewChanges[viewKey]) viewChanges[viewKey] = { view: targetView, exited: [] };
            if (!viewChanges[viewKey].exited) viewChanges[viewKey].exited = [];
            viewChanges[viewKey].exited.push(touch);
          }
        }
        
        // reset last hovered
        touchEntry.lastHovered = nh;
        
        // now map subscribers to touches
        touchViews = touchEntry.views;      
        for (touchViewLen = touchViews.length, touchViewIdx = 0; touchViewIdx < touchViewLen; touchViewIdx++) {
          // more fancy queuing
          touchView = touchViews[touchViewIdx].view;
          viewKey = SC.guidFor(touchView);
          if (!touchesForSubscriber[viewKey]) touchesForSubscriber[viewKey] = [];
          touchesForSubscriber[viewKey].push(touch);
        }
      }
      
      
      /* ..................................................................................
         Send queued events.
         .................................................................................. */
      // loop through queued events
      for (idx in viewChanges) {
        view = viewChanges[idx].view;
        
        // get the view touches, if the view has view touches (we prepared a touch map to do this earlier).
        // Note that these are not only the touches changed (which we could just look up in touchesForSubscriber),
        // but also the touches NOT changed. In short, the entire set of touches for the view.
        // eventTouchesForView takes our touch map (map of touch ids to touch events) and returns the touch
        // events belonging to the view.
        evt.viewTouches = this.eventTouchesForView(view, touchMap);
        
        // exited
        if (viewChanges[idx].exited) {
          evt.viewChangedTouches = viewChanges[idx].exited;
          view.tryToPerform("touchExited", evt);
        }
        
        // entered
        if (viewChanges[idx].entered) {
          evt.viewChangedTouches = viewChanges[idx].entered;
          view.tryToPerform("touchEntered", evt);
        }
        
        // moved
        if (viewChanges[idx].moved) {
          evt.viewChangedTouches = viewChanges[idx].moved;
          view.tryToPerform("touchMoved", evt);
        }
      }
      
      
      /* .......................................................................................
         touchDragged dispatch.
         
         touchDragged is slightly tricky. Thankfully, because of our touchesForSubscriber, we know
         every changed touch for any given subscriber. So, the order in which we call the individual
         subscribers is unimportant, so long as we don't call them twice. Rather than set a flag stating
         we've called/not called, we'll use a generation number--this should be much faster.
         
         We'll cache the result of the call for later.
         
         There is one case where this may not work perfectly: View A contains View B. A and B both receive
         a touch movement. If A's event will be called first, View A will still receive both touches
         even if B stops propagation on its own touch. I don't know of a way to accomplish this without
         either a big hit in performance or _really_ complicated code. So, it will be an edge case.
         ....................................................................................... */
      var generation = ++this._touch_move_generation;
      for (len = touches.length, idx = 0; idx < touches.length; idx++) {
        touch = touches[idx];
        
        // get touch entry
        touchEntry = this._touches[touch.identifier];
        
        // views that stopped subscribing
        var stopped = [];
        
        // get touch views
        touchViews = touchEntry.views;
        for (touchViewLen = touchViews.length, touchViewIdx = 0; touchViewIdx < touchViewLen; touchViewIdx++) {
          touchView = touchViews[touchViewIdx].view;
          viewKey = SC.guidFor(touchView);
          
          touchView = touchViews[touchViewIdx];
          evt.viewChangedTouches = touchesForSubscriber[viewKey];
          evt.viewTouches = this.eventTouchesForView(view, touchMap);
          
          if (touchView.view.respondsTo('touchDragged')) {
            var result; // the result
            
            // if it has not been handled, handle it
            if (touchView.handled !== generation) {
              result = touchView.touchDragged(evt);
              touchView.handledResult = result;
              touchView.handled = generation;
            } else {
              // otherwise, get its previous value
              result = touchView.handledResult;
            }
            
            if (result === YES) {
              // note: will cancel only those that have not been cancelled this generation
              this.cancelTouch(touchViews, touchView, generation);
              touchViews = null;
              touchEntry.views = [touchView];
              break;
            } else if (result === NO) {
              // queue removal of this specific view
              stopped.push(touchView);
            } else if (result === SC.STOP_DRAG_PROPAGATION) {
              break; // stop propagating if the result was SC.STOP_DRAG_PROPAGATION, well...
              // don't propagate. But don't remove from list either.
            }
          }
          
        }
        
        // make them stop listening
        for (touchViewLen = stopped.length, touchViewIdx = 0; touchViewIdx < touchViewLen; touchViewIdx++) {
          touchViews.removeObject(stopped[touchViewIdx]);
        }
      }
  
      
      
      
    } catch (e) {
      SC.Logger.warn('Exception during touchMove: %@'.fmt(e)) ;
    }
    SC.RunLoop.end();
    return NO;
  },

  touchend: function(evt) {
    try {
      evt.cancel = NO ;
      var handler = null, views = this._touchViews, idx, len, view ;

      // attempt the call only if there's a target.
      // don't want a touch end going to anyone unless they handled the 
      // touch start...
      if (views) {
        len = views.get('length');
        for (idx=0; idx<len; idx++) {
          view = views[idx];
          if (view.respondsTo('touchEnd')) {
            view['touchEnd'](evt);
          }
        }
      }
      // cleanup
      this._touchViews = null ;
    } catch (e) {
      SC.Logger.warn('Exception during touchEnd: %@'.fmt(e)) ;
      this._touchViews = null ;
      return NO ;
    }
    return (handler) ? evt.hasCustomEventHandling : YES ;
  },

  /** @private
    Handle touch cancel event.  Works just like touch end except evt.cancel
    is set to YES.
  */
  touchcancel: function(evt) {
    evt.cancel = YES ;
    return this.touchend(evt);
  },

  /**
    If multiple views were subscribed to touch events, sends a touchCancelled
    event to all but the new, exclusive view. This is usually called when
    a view asks for exclusive control by returning YES from a touchDragged
    event.

    @param {Array} views the array of views subscribed to touch events
    @param {SC.View} newView the new view that is asking for exclusive control
    @param {Event} evt the touch event
    @private
  */
  cancelTouch: function(views, newView, evt, generation) {
    var viewEntry, view, idx, len;

    len = views.get('length');
    for (idx = 0; idx < len; idx++) {
      viewEntry = views[idx];
      if (viewEntry.cancelledOn === generation) continue;
      view = viewEntry.view;

      if (view !== newView) {
        view.tryToPerform('touchCancelled', evt);
      }
    }
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
