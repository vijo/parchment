/*

StructIO
========

Copyright (c) 2011 The Parchment Contributors
BSD licenced
http://code.google.com/p/parchment

*/
(function( $ ){

// Subclass jQuery
// No point until subclasses support their own csshooks
//var $ = originaljQuery.sub();

// Add a CSS hook for reverse text
$.cssHooks.reverse = {
	set: function( elem, value )
	{
		if ( value )
		{
			// Get the current foreground and background colours
			var $elem = $( elem ),
			foreground = $elem.css( 'color' ),
			background;
			// Getting the current background colour is hard: go through the parent elements until one with a real colour is found
			$elem.add( $elem.parents() )
				.each( function() {
					var mybackground = $( this ).css( 'background-color' );
					if ( !background && mybackground && mybackground != 'transparent' && mybackground != 'inherit' )
					{
						background = mybackground;
					}
				});
			// Now swap them!
			$elem.css({
				color: background,
				'background-color': foreground
			})
				.addClass( 'reverse' );
		}
	}
};

// The public API
// .input() must be set by whatever uses StructIO
window.StructIO = Object.subClass({
	
	init: function( element )
	{
		this.container = $( element );
		this.target = this.container;
		this.TextInput = new TextInput( this.container );
	},
	
	// Process some output events
	event: function( orders )
	{
		var self = this,
		order, i, response,
		stop,
		target = this.target;
		
		// Process the orders
		for ( i = 0; i < orders.length; i++ )
		{
			order = orders[i];
			
			// Find a new target element
			if ( order.code == 'find' )
			{
				target = $( '.' + order.name );
			}
			
			// Add a structure
			if ( order.code == 'addstruct' )
			{
				target.append( '<' + ( order.node || 'div' ) + ( order.name ? ' class="' + order.name + '"' : '' ) + '>' );
			}
			
			// Text output
			if ( order.code == 'print' )
			{
				$( order.css.node ? '<' + order.css.node + '>' : '<span>' )
					.appendTo( target )
					.css( order.css )
					.html( order.text.replace( /\n/g, '<br>' ) );
			}
			
			// Line input
			if ( order.code == 'read' )
			{
				this.TextInput.getLine( target, function( response )
				{
					order.response = response;
					order.terminator = 13;
					self.input( order );
				} );
			}
		}
		
		return stop;
	}
});

})( jQuery );