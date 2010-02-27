// ==========================================================================
// Project:   SproutCore - JavaScript Application Framework
// Copyright: ©2006-2009 Sprout Systems, Inc. and contributors.
//            Portions ©2008-2009 Apple Inc. All rights reserved.
// License:   Licened under MIT license (see license.js)
// ==========================================================================

/** @class
  Represents a theme. Also is the singleton theme manager.
  
  @extends SC.Object
  @since SproutCore 1.1
*/
SC.Theme = SC.Object.extend({
  concatenatedProperties: "classNames".w(),
  classNames: []
});

SC.mixin(SC.Theme, {
  /**
    Extends the theme, and makes sure theme.renderers points to the theme's prototype.
  */
  extend: function() {
    var result = SC.Object.extend.apply(this, arguments);
    result.renderers = result.prototype; // make a renderers object so you don't keep typing .prototype.whatever
    return result;
  },
  
  /* Theme management */
  themes: {},
  
  /**
    Finds a theme by name.
  */
  find: function(themeName) {
    var theme = SC.Theme.themes[themeName];
    if (SC.none(theme)) return null;
    return theme;
  },
  
  /**
    Registers a theme with SproutCore, creating an instance of it.
  */
  register: function(themeName, theme) {
    SC.Theme.themes[themeName] = theme.create();
  }
});